# mlds_dataset.py

import json
import os
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from scipy.ndimage import gaussian_filter

# --- Configuration Constants ---
# These values define the coordinate system and the output tensor dimensions.
# Ensure they are consistent across your project (pitch control, model, etc.).

# Pitch dimensions in meters, centered at (0,0)
PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0

# The desired resolution of the raster images fed into the CNN
IMAGE_HEIGHT = 80
IMAGE_WIDTH = 124

# Used to normalize velocity values to a [-1, 1] range for the model
MAX_SPEED_NORMALIZATION = 10.0  # Assumed max speed in m/s

class MLLDS_Dataset(Dataset):
    """
    PyTorch Dataset for Project MLLDS (Machine Learning Leakage Detection System).

    This class loads the structured JSONL data collected from the annotation tool,
    pre-processes it into a rich, multi-modal format, and prepares it as tensors
    for training a dual-head computer vision model.

    It handles:
    - Rasterization of player positions and velocities into multi-channel images.
    - Integration of pre-computed pitch control maps.
    - Assembly of a global feature vector with high-level tactical context.
    - Generation of a Gaussian blob heatmap for the ground truth leakage location.
    - Correct handling of both positive (leakage) and negative (no leakage) samples.
    """
    def __init__(self, jsonl_path, pitch_control_dir='data/pitch_control', transform=None):
        """
        Args:
            jsonl_path (string): Path to the .jsonl file with all annotated samples.
            pitch_control_dir (string): Path to the directory containing pre-computed
                                        pitch control .npy files.
            transform (callable, optional): Optional transform (e.g., for data augmentation)
                                            to be applied on a sample.
        """
        self.samples = []
        with open(jsonl_path, 'r') as f:
            for line in f:
                self.samples.append(json.loads(line))
        
        self.pitch_control_dir = pitch_control_dir
        self.transform = transform
        
        self.pitch_dims = (PITCH_LENGTH, PITCH_WIDTH)
        self.img_dims = (IMAGE_WIDTH, IMAGE_HEIGHT)
        
        print(f"Loaded {len(self.samples)} samples from {jsonl_path}")

    def __len__(self):
        return len(self.samples)

    def _world_to_pixel(self, x, z):
        """
        Converts world coordinates (meters, centered at origin) to image pixel
        coordinates (top-left origin).
        """
        # Shift origin from pitch center (0,0) to image top-left (0,0)
        px = x + self.pitch_dims[0] / 2
        py = z + self.pitch_dims[1] / 2
        
        # Scale to image dimensions
        px = (px / self.pitch_dims[0]) * self.img_dims[0]
        py = (py / self.pitch_dims[1]) * self.img_dims[1]
        
        # Clamp to ensure coordinates are within the image bounds
        px = np.clip(int(px), 0, self.img_dims[0] - 1)
        py = np.clip(int(py), 0, self.img_dims[1] - 1)
        
        return px, py

    def __getitem__(self, idx):
        # Retrieve the raw data sample for the given index
        sample = self.samples[idx]
        
        # ====================================================================
        # 1. PREPARE MODEL INPUTS
        # ====================================================================

        # --- A. Raster Channel Inputs ---
        attacking_team = sample['metadata']['attacking_team_name']
        carrier_id = sample['metadata'].get('carrier_id')
        carrier_pos = {'x': 0.0, 'z': 0.0} # Initialize default carrier position

        # Initialize empty numpy arrays for each channel
        # Shape: (IMAGE_HEIGHT, IMAGE_WIDTH)
        channels = {
            'attackers': np.zeros(self.img_dims[::-1], dtype=np.float32),
            'defenders': np.zeros(self.img_dims[::-1], dtype=np.float32),
            'ball': np.zeros(self.img_dims[::-1], dtype=np.float32),
            'carrier': np.zeros(self.img_dims[::-1], dtype=np.float32),
            'velocity_x': np.zeros(self.img_dims[::-1], dtype=np.float32),
            'velocity_z': np.zeros(self.img_dims[::-1], dtype=np.float32),
        }

        for player in sample['input_features']['player_data']:
            px, py = self._world_to_pixel(player['x'], player['z'])
            
            # Populate velocity channels for all players
            channels['velocity_x'][py, px] = player.get('vx', 0.0) / MAX_SPEED_NORMALIZATION
            channels['velocity_z'][py, px] = player.get('vz', 0.0) / MAX_SPEED_NORMALIZATION

            # Populate positional channels
            if player['team'] == 'Ball':
                channels['ball'][py, px] = 1.0
            elif player['team'] == attacking_team:
                channels['attackers'][py, px] = 1.0
                if player['id'] == carrier_id:
                    channels['carrier'][py, px] = 1.0
                    carrier_pos['x'] = player['x']
                    carrier_pos['z'] = player['z']
            elif player['role'] not in ['REF']: # Ignore referees
                channels['defenders'][py, px] = 1.0

        # Load pre-computed Pitch Control map
        timestamp = sample['metadata']['timestamp_ms']
        pitch_control_path = os.path.join(self.pitch_control_dir, f'frame_{timestamp}.npy')
        try:
            pitch_control_channel = np.load(pitch_control_path)
            # Ensure the loaded map has the correct dimensions
            if pitch_control_channel.shape != self.img_dims[::-1]:
                 pitch_control_channel = np.zeros(self.img_dims[::-1], dtype=np.float32)
        except (FileNotFoundError, ValueError):
            # print(f"Warning: Pitch control file not found or invalid for ts {timestamp}. Using a zero map.")
            pitch_control_channel = np.zeros(self.img_dims[::-1], dtype=np.float32)

        # Stack all channels into a single multi-channel image tensor
        raster_input = np.stack([
            channels['attackers'], 
            channels['defenders'], 
            channels['ball'],
            channels['carrier'],
            channels['velocity_x'],
            channels['velocity_z'],
            pitch_control_channel
        ], axis=0) # Final Shape: (7, IMAGE_HEIGHT, IMAGE_WIDTH)

        # --- B. Global Feature Vector Input ---
        global_features_dict = sample['input_features']['global_feature_vector']
        attacking_direction = sample['metadata'].get('attacking_direction', 0)
        
        # Assemble the final vector, including the new features
        global_features_vec = np.array(
            list(global_features_dict.values()) + \
            [attacking_direction, carrier_pos['x'], carrier_pos['z']],
            dtype=np.float32
        )

        # ====================================================================
        # 2. PREPARE GROUND TRUTH LABELS
        # ====================================================================

        # --- A. Target Leakage Heatmap ---
        target_heatmap = np.zeros(self.img_dims[::-1], dtype=np.float32)
        lq_box = sample['ground_truth_labels']['target_lq_box']
        
        # Handle positive vs. negative samples
        if lq_box is not None:
            # Positive sample: Create a Gaussian blob at the target location
            center_x, center_z = lq_box['center_x'], lq_box['center_z']
            tx, ty = self._world_to_pixel(center_x, center_z)

            target_heatmap[ty, tx] = 1.0
            # A Gaussian provides a better learning signal than a single pixel
            target_heatmap = gaussian_filter(target_heatmap, sigma=2.0)
            if target_heatmap.max() > 0:
                target_heatmap /= target_heatmap.max() # Normalize peak to 1.0
        # For negative samples (lq_box is None), the heatmap remains all zeros.

        # Add a channel dimension for consistency: (1, IMAGE_HEIGHT, IMAGE_WIDTH)
        target_heatmap = np.expand_dims(target_heatmap, axis=0)

        # --- B. Target LS Score ---
        # For negative samples, this score will correctly be 0.0
        target_ls_score = np.array([sample['ground_truth_labels']['target_ls_score']], dtype=np.float32)

        # ====================================================================
        # 3. APPLY TRANSFORMS (IF ANY)
        # ====================================================================
        if self.transform:
            raster_input, target_heatmap = self.transform(raster_input, target_heatmap)

        # ====================================================================
        # 4. CONVERT TO TORCH TENSORS AND RETURN
        # ====================================================================
        return {
            'raster_input': torch.from_numpy(raster_input),
            'global_features': torch.from_numpy(global_features_vec),
            'target_heatmap': torch.from_numpy(target_heatmap),
            'target_ls_score': torch.from_numpy(target_ls_score)
        }


# --- Example Usage Block ---
if __name__ == '__main__':
    # This block will only run when you execute `python mlds_dataset.py` directly.
    # It's a great way to test and debug your Dataset class.

    # STEP 1: Create a dummy .jsonl file for testing
    print("Creating a dummy 'test_data.jsonl' file...")
    dummy_data = []
    # Create a positive sample
    positive_sample = {
        "metadata": {"timestamp_ms": 1000, "attacking_team_name": "Team A", "carrier_id": "P1", "attacking_direction": 1},
        "ground_truth_labels": {"target_lq_box": {"center_x": 25.0, "center_z": 10.0, "width": 10, "height": 10}, "target_ls_score": 0.85},
        "input_features": {
            "player_data": [
                {"id": "P1", "team": "Team A", "role": "CF", "x": -5, "z": -5, "vx": 2.0, "vz": 1.0},
                {"id": "P2", "team": "Team B", "role": "CB", "x": 20, "z": 8, "vx": -1.0, "vz": 0.0},
                {"id": "Ball", "team": "Ball", "role": "BALL", "x": -4.8, "z": -4.9, "vx": 0, "vz": 0},
            ],
            "global_feature_vector": { "attack_centroid_x":-5,"attack_centroid_z":-5,"defend_centroid_x":20,"defend_centroid_z":8,"attack_width":0,"attack_depth":0,"defend_width":0,"defend_depth":0,"defensive_line_depth":20,"formation_disruption_index":0 }
        }
    }
    # Create a negative sample
    negative_sample = {
        "metadata": {"timestamp_ms": 2000, "attacking_team_name": "Team A", "carrier_id": "P3", "attacking_direction": 1},
        "ground_truth_labels": {"target_lq_box": None, "target_ls_score": 0.0},
        "input_features": {
            "player_data": [
                {"id": "P3", "team": "Team A", "role": "CM", "x": -20, "z": 0, "vx": 0.5, "vz": -0.5},
                {"id": "P4", "team": "Team B", "role": "CM", "x": -15, "z": 0, "vx": 0, "vz": 0},
            ],
            "global_feature_vector": { "attack_centroid_x":-20,"attack_centroid_z":0,"defend_centroid_x":-15,"defend_centroid_z":0,"attack_width":0,"attack_depth":0,"defend_width":0,"defend_depth":0,"defensive_line_depth":-15,"formation_disruption_index":0 }
        }
    }
    with open("test_data.jsonl", "w") as f:
        f.write(json.dumps(positive_sample) + "\n")
        f.write(json.dumps(negative_sample) + "\n")

    # STEP 2: Create a dummy pitch control directory and files
    print("Creating dummy pitch control files...")
    pc_dir = 'data/pitch_control'
    os.makedirs(pc_dir, exist_ok=True)
    dummy_pc_map_1 = np.random.rand(IMAGE_HEIGHT, IMAGE_WIDTH).astype(np.float32)
    dummy_pc_map_2 = np.zeros((IMAGE_HEIGHT, IMAGE_WIDTH), dtype=np.float32)
    np.save(os.path.join(pc_dir, 'frame_1000.npy'), dummy_pc_map_1)
    np.save(os.path.join(pc_dir, 'frame_2000.npy'), dummy_pc_map_2)

    # STEP 3: Instantiate and test the Dataset and DataLoader
    print("\n--- Testing MLLDS_Dataset ---")
    dataset = MLLDS_Dataset(jsonl_path='test_data.jsonl', pitch_control_dir=pc_dir)
    data_loader = DataLoader(dataset, batch_size=2, shuffle=False)

    # Fetch one batch of data
    batch = next(iter(data_loader))
    
    # Verify the shapes and contents
    print(f"\nBatch loaded successfully. Verifying shapes for batch_size=2:")
    
    # Inputs
    raster_in = batch['raster_input']
    global_in = batch['global_features']
    print(f"  Raster Inputs Shape:     {raster_in.shape}")
    assert raster_in.shape == (2, 7, IMAGE_HEIGHT, IMAGE_WIDTH)
    
    print(f"  Global Features Shape:   {global_in.shape}")
    # 10 original global features + 1 direction + 2 carrier coords = 13
    assert global_in.shape == (2, 13)

    # Labels
    heatmap_out = batch['target_heatmap']
    ls_score_out = batch['target_ls_score']
    print(f"  Target Heatmaps Shape:   {heatmap_out.shape}")
    assert heatmap_out.shape == (2, 1, IMAGE_HEIGHT, IMAGE_WIDTH)
    
    print(f"  Target LS Scores Shape:  {ls_score_out.shape}")
    assert ls_score_out.shape == (2, 1)

    # Verify content of the first (positive) sample
    print("\nVerifying content of positive sample (index 0):")
    # Check if the heatmap has a peak (sum will be > 0)
    print(f"  Heatmap sum: {heatmap_out[0].sum():.2f} (should be > 0)")
    assert heatmap_out[0].sum() > 0
    # Check the LS score
    print(f"  LS Score: {ls_score_out[0].item():.2f} (should be 0.85)")
    assert ls_score_out[0].item() == 0.85

    # Verify content of the second (negative) sample
    print("\nVerifying content of negative sample (index 1):")
    # Check if the heatmap is all zeros
    print(f"  Heatmap sum: {heatmap_out[1].sum():.2f} (should be 0.0)")
    assert heatmap_out[1].sum() == 0
    # Check the LS score
    print(f"  LS Score: {ls_score_out[1].item():.2f} (should be 0.0)")
    assert ls_score_out[1].item() == 0.0

    print("\n✅ All tests passed. The Dataset class is working correctly.")

    # Clean up dummy files
    os.remove("test_data.jsonl")
    os.remove(os.path.join(pc_dir, 'frame_1000.npy'))
    os.remove(os.path.join(pc_dir, 'frame_2000.npy'))