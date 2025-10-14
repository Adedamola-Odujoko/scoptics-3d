import json
import numpy as np
import os
from scipy.spatial.distance import cdist
from tqdm import tqdm

# --- Configuration Constants (should match your dataset loader) ---
PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0
IMAGE_HEIGHT = 80
IMAGE_WIDTH = 124

# --- Pitch Control Model Parameters (Tunable) ---
# For a more detailed explanation of these parameters, see Friends of Tracking blog.
TIME_TO_INTERCEPT_LIMIT = 4.0  # Max seconds into the future we project
PLAYER_MAX_SPEED = 9.0         # m/s
PLAYER_REACTION_TIME = 0.7     # seconds
BALL_AVERAGE_SPEED = 15.0      # m/s

def calculate_pitch_control_for_frame(player_data, attacking_team_name, attacking_direction):
    """
    Calculates a pitch control map for a single frame of data.
    Returns a 2D numpy array (IMAGE_HEIGHT, IMAGE_WIDTH) with values from -1 (fully defended) to +1 (fully attacking).
    """
    # 1. Create a grid of target points on the pitch
    x_coords = np.linspace(-PITCH_LENGTH / 2, PITCH_LENGTH / 2, IMAGE_WIDTH)
    z_coords = np.linspace(-PITCH_WIDTH / 2, PITCH_WIDTH / 2, IMAGE_HEIGHT)
    target_points = np.array(np.meshgrid(x_coords, z_coords)).T.reshape(-1, 2)

    # 2. Separate players into attackers and defenders
    attackers = [p for p in player_data if p['team'] == attacking_team_name]
    defenders = [p for p in player_data if p['team'] != attacking_team_name and p['role'] not in ['BALL', 'REF']]
    
    # Initialize arrays to store time-to-intercept for each team
    min_time_attackers = np.full(target_points.shape[0], TIME_TO_INTERCEPT_LIMIT)
    min_time_defenders = np.full(target_points.shape[0], TIME_TO_INTERCEPT_LIMIT)

    # 3. Calculate time-to-intercept for each player to each grid point
    for team, players, min_time_array in [('attackers', attackers, min_time_attackers), 
                                          ('defenders', defenders, min_time_defenders)]:
        if not players:
            continue
            
        positions = np.array([[p['x'], p['z']] for p in players])
        velocities = np.array([[p['vx'], p['vz']] for p in players])
        
        # Calculate distance from each player to each target point
        dist_to_target = cdist(positions, target_points)
        
        # Project player's future position
        # Simplified model: Assumes player runs straight towards the target point
        player_to_target_vec = target_points[np.newaxis, :, :] - positions[:, np.newaxis, :]
        player_to_target_dist = np.linalg.norm(player_to_target_vec, axis=2)
        player_to_target_unit_vec = player_to_target_vec / (player_to_target_dist[..., np.newaxis] + 1e-6)

        # Dot product of velocity and direction to target
        # A positive value means the player is already moving towards the target
        dot_product = np.einsum('ij,ijk->ik', velocities, player_to_target_unit_vec)
        
        # Effective speed towards the target
        effective_speed = np.clip(dot_product, 0, PLAYER_MAX_SPEED)
        
        # Time to intercept calculation (d / v)
        time_to_intercept = player_to_target_dist / (effective_speed + 1e-6)
        
        # Add reaction time
        time_to_intercept += PLAYER_REACTION_TIME
        
        # Update the minimum time for the team if a player is faster
        min_time_for_team = np.min(time_to_intercept, axis=0)
        np.minimum(min_time_array, min_time_for_team, out=min_time_array)

    # 4. Calculate pitch control probability using a sigmoid function
    control_diff = min_time_defenders - min_time_attackers
    # The sigmoid function maps the time difference to a probability [0, 1]
    # A large positive diff (attackers much faster) -> control ~ 1
    # A large negative diff (defenders much faster) -> control ~ 0
    pitch_control_prob = 1 / (1 + np.exp(-control_diff))
    
    return pitch_control_prob.reshape(IMAGE_HEIGHT, IMAGE_WIDTH)


def process_data_file(jsonl_path, output_dir='data/pitch_control'):
    """
    Main function to loop through a JSONL file and generate pitch control maps.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created directory: {output_dir}")

    with open(jsonl_path, 'r') as f:
        lines = f.readlines()

    for line in tqdm(lines, desc="Generating Pitch Control Maps"):
        sample = json.loads(line)
        timestamp = sample['metadata']['timestamp_ms']
        
        # Check if the file already exists to avoid re-computation
        output_path = os.path.join(output_dir, f'frame_{timestamp}.npy')
        if os.path.exists(output_path):
            continue

        pc_map = calculate_pitch_control_for_frame(
            player_data=sample['input_features']['player_data'],
            attacking_team_name=sample['metadata']['attacking_team_name'],
            attacking_direction=sample['metadata'].get('attacking_direction', 1)
        )
        
        np.save(output_path, pc_map.astype(np.float32))

if __name__ == '__main__':
    # --- USAGE ---
    # Run this script from your terminal: python pitch_control.py
    data_file = 'mlds_data_YYYY-MM-DD.jsonl' # <-- CHANGE TO YOUR DATA FILE NAME
    if not os.path.exists(data_file):
        print(f"Error: Data file not found at '{data_file}'. Please update the path.")
    else:
        process_data_file(jsonl_path=data_file)
        print("Pitch control map generation complete.")