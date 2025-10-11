import { Vector2, Vector3 } from "three";

/**
 * Finds the closest player to a target position from a list of players.
 * @param {Vector3} targetPosition - The position to measure from.
 * @param {Array<object>} players - An array of player objects with a .mesh property.
 * @returns {{player: object, distance: number}}
 */
export function findClosestPlayer(targetPosition, players) {
  let closestPlayer = null;
  let minDistance = Infinity;
  for (const player of players) {
    if (!player || !player.mesh) continue;
    const distance = player.mesh.position.distanceTo(targetPosition);
    if (distance < minDistance) {
      minDistance = distance;
      closestPlayer = player;
    }
  }
  return { player: closestPlayer, distance: minDistance };
}

/**
 * Checks if a 3D point (p) is inside the 2D triangle formed by p0, p1, and p2 on the XZ plane.
 * @param {Vector3} p - The point to check.
 * @param {Vector3} p0 - First vertex of the triangle.
 * @param {Vector3} p1 - Second vertex of the triangle.
 * @param {Vector3} p2 - Third vertex of the triangle.
 * @returns {boolean}
 */
export function isPointInTriangle(p, p0, p1, p2) {
  if (!p || !p0 || !p1 || !p2) return false;
  const p_2d = new Vector2(p.x, p.z);
  const p0_2d = new Vector2(p0.x, p0.z);
  const p1_2d = new Vector2(p1.x, p1.z);
  const p2_2d = new Vector2(p2.x, p2.z);
  const s =
    p0_2d.y * p2_2d.x -
    p0_2d.x * p2_2d.y +
    (p2_2d.y - p0_2d.y) * p_2d.x +
    (p0_2d.x - p2_2d.x) * p_2d.y;
  const t =
    p0_2d.x * p1_2d.y -
    p0_2d.y * p1_2d.x +
    (p0_2d.y - p1_2d.y) * p_2d.x +
    (p1_2d.x - p0_2d.x) * p_2d.y;
  if (s < 0 !== t < 0 && s !== 0 && t !== 0) return false;
  const A =
    -p1_2d.y * p2_2d.x +
    p0_2d.y * (p2_2d.x - p1_2d.x) +
    p0_2d.x * (p1_2d.y - p2_2d.y) +
    p1_2d.x * p2_2d.y;
  return A < 0 ? s <= 0 && s + t >= A : s >= 0 && s + t <= A;
}

/**
 * Calculates the 2D area of a polygon defined by an array of 3D vectors on the XZ plane.
 * @param {Array<Vector3>} corners - The vertices of the polygon.
 * @returns {number}
 */
export function calculatePolygonArea(corners) {
  let area = 0;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % n];
    area += p1.x * p2.z - p2.x * p1.z; // Using .z for the y-coordinate in 2D space
  }
  return Math.abs(area / 2.0);
}
