import Phaser from "phaser";
import PhaserNavMesh from "./phaser-navmesh";
import { parseSquareMap } from "navmesh/src/map-parser";

/**
 * This class can create navigation meshes for use in Phaser 3. The navmeshes can be constructed
 * from convex polygons embedded in a Tiled map. The class that conforms to Phaser 3's plugin
 * structure.
 *
 * @export
 * @class PhaserNavMeshPlugin
 */
export default class PhaserNavMeshPlugin extends Phaser.Plugins.ScenePlugin {
  private phaserNavMeshes: Record<string, PhaserNavMesh> = {};

  public constructor(scene: Phaser.Scene, pluginManager: Phaser.Plugins.PluginManager) {
    super(scene, pluginManager);
  }

  /** Phaser.Scene lifecycle event */
  public boot() {
    const emitter = this.systems.events;
    emitter.once("destroy", this.destroy, this);
  }

  /** Phaser.Scene lifecycle event - noop in this plugin, but still required. */
  public init() {}

  /** Phaser.Scene lifecycle event - noop in this plugin, but still required.*/
  public start() {}

  /** Phaser.Scene lifecycle event - will destroy all navmeshes created. */
  public destroy() {
    this.systems.events.off("boot", this.boot, this);
    this.removeAllMeshes();
  }

  /**
   * Remove all the meshes from the navmesh.
   */
  public removeAllMeshes() {
    const meshes = Object.values(this.phaserNavMeshes);
    this.phaserNavMeshes = {};
    meshes.forEach((m) => m.destroy());
  }

  /**
   * Remove the navmesh stored under the given key from the plugin. This does not destroy the
   * navmesh.
   * @param key
   */
  public removeMesh(key: string) {
    if (this.phaserNavMeshes[key]) delete this.phaserNavMeshes[key];
  }

  /**
   * This is a work-in-progress! This is a rough implementation of an automatic mesh builder. It
   * takes the given tilemap (and optional layers) and uses them to construct a navmesh based on
   * which tiles are set to collide.
   *
   * TODO: refactor, factor in shrink, consider excluding blank tiles, consider taking a isWalkable
   * callback, factor in XY position/scale/rotation of layers?
   *
   * @param key Key to use when storing this navmesh within the plugin.
   * @param tilemap The tilemap to use for building the navmesh.
   * @param tilemapLayers An optional array of tilemap layers to use for building the mesh.
   */

  public buildMeshFromTilemap(
    key: string,
    tilemap: Phaser.Tilemaps.Tilemap,
    tilemapLayers?: Phaser.Tilemaps.TilemapLayer[]
  ) {
    // Use all layers in map, or just the specified ones.
    const dataLayers = tilemapLayers ? tilemapLayers.map((tl) => tl.layer) : tilemap.layers;

    // Build 2D array of walkable tiles across all given layers.
    const walkableAreas: number[][] = [];
    for (let tx = 0; tx < tilemap.width; tx += 1) {
      const row: number[] = [];
      for (let ty = 0; ty < tilemap.height; ty += 1) {
        let collides = false;
        for (const layer of dataLayers) {
          const tile = layer.data[ty][tx];
          if (tile && tile.collides) {
            collides = true;
            break;
          }
        }
        row.push(collides ? 0 : 1);
      }
      walkableAreas.push(row);
    }

    const hulls = parseSquareMap(walkableAreas);
    const { tileWidth, tileHeight } = tilemap;
    const polygons = hulls.map((hull) => {
      const left = hull.left * tileWidth;
      const top = hull.top * tileHeight;
      const right = (hull.right + 1) * tileWidth;
      const bottom = (hull.bottom + 1) * tileHeight;
      return [
        { x: left, y: top },
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
      ];
    });

    console.log(polygons.length);

    const mesh = new PhaserNavMesh(this, this.scene, key, polygons, 0);

    this.phaserNavMeshes[key] = mesh;

    return mesh;
  }

  /**
   * Load a navmesh from Tiled. Currently assumes that the polygons are squares! Does not support
   * tilemap layer scaling, rotation or position.
   * @param key Key to use when storing this navmesh within the plugin.
   * @param objectLayer The ObjectLayer from a tilemap that contains the polygons that make up the
   * navmesh.
   * @param meshShrinkAmount The amount (in pixels) that the navmesh has been shrunk around
   * obstacles (a.k.a the amount obstacles have been expanded)
   */
  public buildMeshFromTiled(
    key: string,
    objectLayer: Phaser.Tilemaps.ObjectLayer,
    meshShrinkAmount = 0
  ) {
    if (this.phaserNavMeshes[key]) {
      console.warn(`NavMeshPlugin: a navmesh already exists with the given key: ${key}`);
      return this.phaserNavMeshes[key];
    }

    if (!objectLayer || objectLayer.objects.length === 0) {
      console.warn(
        `NavMeshPlugin: The given tilemap object layer is empty or undefined: ${objectLayer}`
      );
    }

    const objects = objectLayer.objects ?? [];

    // Loop over the objects and construct a polygon - assumes a rectangle for now!
    // TODO: support layer position, scale, rotation
    const polygons = objects.map((obj) => {
      const h = obj.height ?? 0;
      const w = obj.width ?? 0;
      const left = obj.x ?? 0;
      const top = obj.y ?? 0;
      const bottom = top + h;
      const right = left + w;
      return [
        { x: left, y: top },
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
      ];
    });

    const mesh = new PhaserNavMesh(this, this.scene, key, polygons, meshShrinkAmount);
    console.log(polygons.length);

    this.phaserNavMeshes[key] = mesh;

    return mesh;
  }
}