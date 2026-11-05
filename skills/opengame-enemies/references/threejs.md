# Enemies in three.js

three.js has no navigation of its own. The usual choice is recast-navigation-js, a
WebAssembly build of Recast and Detour, the navigation library that Unreal and Godot
build on. Its packages are `recast-navigation` (core, generators) and
`@recast-navigation/three` (helpers that read three.js meshes and draw debug views).
Check the names below against the version you install; the API has moved between
releases.

## Building the navmesh

```js
import { init, NavMeshQuery, Crowd } from 'recast-navigation'
import { threeToSoloNavMesh, threeToTileCache, NavMeshHelper } from '@recast-navigation/three'

await init()
const { success, navMesh } = threeToSoloNavMesh(walkableMeshes, {
  cs: 0.2, ch: 0.2,              // cell size and cell height in metres
  walkableRadius: 2,             // in cells: 2 x cs = 0.4 m
  walkableHeight: 9,             // in cells of ch: 1.8 m
  walkableClimb: 2,              // in cells of ch: 0.4 m, the body's step
  walkableSlopeAngle: 40,
})
scene.add(new NavMeshHelper(navMesh))
```

- Build from the collision meshes, not the render meshes. Decorative clutter with a
  dense mesh blocks small steps; give it a simple proxy or leave it out.
- Recast counts radius, height and climb in cells. Convert from the world spec's metres
  so `walkableClimb * ch` equals the controller's step height
  (`opengame-world-physics`). The values in the block above are an example, not OC's.
- For a level that changes during play, use `threeToTileCache` (or `generateTileCache`)
  with a small `tileSize`, so one tile rebuilds quickly.

## Off-mesh connections: jumps, drops and climbs

Pass links as `offMeshConnections` when generating a solo or tiled navmesh:

```js
offMeshConnections: [
  { startPosition: takeoff, endPosition: landing, radius: 0.5,
    bidirectional: false, area: JUMP_AREA, flags: 1, userId: linkId },
]
```

With a tile cache, the same objects go through `navMeshCreateParams.setOffMeshConnections`
in the tile cache's mesh process. Generate the list yourself from the agent's jump
height, jump distance and safe drop height:

1. Find ledge edges in the collision geometry (a walkable polygon edge with a drop or a
   gap beyond it).
2. For each edge sample, cast down and across within the agent's reach to find a
   landing that has room for the body.
3. Check the arc with a capsule sweep against the colliders.
4. Publish one connection per accepted pair, with an area id that tells the agent which
   motion to play. Use `bidirectional: true` only when the climb back is also possible.
5. Regenerate the links that touch a player-built piece when it is placed, raised or
   destroyed.

When an agent reaches a connection, Detour hands it the start and end; play the jump or
drop motion on your own controller, then let the crowd resume.

## Crowds

```js
const crowd = new Crowd(navMesh, { maxAgents: 64, maxAgentRadius: 0.6 })
const agent = crowd.addAgent(spawn, { radius: 0.4, height: 1.8, maxSpeed: 3.4,
  maxAcceleration: 20 })
agent.requestMoveTarget(playerPosition)
crowd.update(dt)              // once per fixed step
mesh.position.copy(agent.position())
```

- The crowd does local avoidance and path following for every agent at once, which is
  far cheaper than one path query per enemy per frame.
- Request a new move target only when the player has moved a meaningful distance, and at
  most a few agents per frame; the rest keep their last target.
- `agent.teleport(position)` is the out-of-sight respawn step. Count every call in your
  teammate metrics so teleports cannot pass as navigation.

## Path requests across frames

For agents outside the crowd (a boss, a scripted ally), queue `NavMeshQuery.computePath`
calls and run a fixed number per frame:

```js
const query = new NavMeshQuery(navMesh)
const queue = []
function requestPath(agentId, from, to) { queue.push({ agentId, from, to }) }
function pumpPaths(maxPerFrame) {
  for (let i = 0; i < maxPerFrame && queue.length; i++) {
    const { agentId, from, to } = queue.shift()
    const { success, path } = query.computePath(from, to)
    deliverPath(agentId, success ? path : null)
  }
}
```

Agents heading to the same place (the player) can share one path to a nearby point and
let the crowd spread them. Back off after a failed request instead of asking again next
frame.

## Obstacles and rebuilds within a frame budget

```js
const { tileCache } = threeToTileCache(walkableMeshes, { tileSize: 16 /* , ... */ })
const { obstacle } = tileCache.addBoxObstacle(center, halfExtents, angle)
// every frame:
const { upToDate } = tileCache.update(navMesh)
```

- `tileCache.update` works through queued obstacle changes over successive calls and
  reports `upToDate` when it has finished. Call it once per frame and time it; if one
  tile takes longer than the frame budget, make the tiles smaller.
- Doors, gates and barricades are obstacles or area flags that the query filter
  excludes, so opening one does not regenerate geometry.
- Do not add obstacles for short boss effects; treat them as damage areas the agents
  avoid by steering.

## Debug views

`NavMeshHelper`, `OffMeshConnectionsHelper`, `TileCacheHelper` and `CrowdHelper` from
`@recast-navigation/three` draw the navmesh, links, tile cache obstacles and agents. For
a capture, draw links as arcs (`Line2`) coloured by area id, so a missing link on a
player build is visible.

## Other engines

- Godot: `NavigationRegion3D`, `NavigationAgent3D` and `NavigationLink3D` for jumps;
  `NavigationMesh.agent_max_climb` is the step; bake on a thread with
  `bake_navigation_mesh(true)`.
- Unity: the AI Navigation package's `NavMeshSurface`, `NavMeshLink` for jumps and
  `NavMeshObstacle` with carving for doors; the agent type's Step Height is the step;
  `NavMeshSurface.UpdateNavMesh` rebuilds asynchronously.
