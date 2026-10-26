// Chests in a version's blocks_states.json and blocks_models.json. The game draws chests with a block entity renderer,
// so the jar has no model of them (their blockstate names a model with only a particle texture). This builds them from
// the chest textures (entity/chest/, copied into blocks/ as entity__chest__<name>), as that renderer lays them out:
//  - before 1.15 the classic model on the single sheet (normal: 64 x 64) and the double sheet (normal_double: 128 x 64,
//    the boxes 30 wide), the latch at the front
//  - from 1.15 the single, left and right models on their own sheets (normal, normal_left, normal_right: 64 x 64)
// A chest's variants are keyed by its facing and by two values the viewer works out (prismarine-viewer's models.js):
// block_entity.pair, the side its other half is on (none when single; an ender chest has none), and block_entity.lid,
// how far its lid is open, from 0 (shut) to LID_STEPS (a quarter turn up about its hinge at the back).
//
//   node chest_models.js <version folder>...   (a folder image_names.js wrote: blocks_states.json, entity/, blocks/)
const fs = require('fs')
const path = require('path')

const LID_STEPS = 9
const SIDES = ['north', 'east', 'south', 'west']

// the chest blocks and the name of their sheets
const CHESTS = {
  chest: 'normal',
  trapped_chest: 'trapped',
  ender_chest: 'ender',
  copper_chest: 'copper',
  exposed_copper_chest: 'copper_exposed',
  weathered_copper_chest: 'copper_weathered',
  oxidized_copper_chest: 'copper_oxidized',
  waxed_copper_chest: 'copper',
  waxed_exposed_copper_chest: 'copper_exposed',
  waxed_weathered_copper_chest: 'copper_weathered',
  waxed_oxidized_copper_chest: 'copper_oxidized'
}

// The corners of each face of an element as the game lays a face's UV over it: [x, y, z] of the box's min (0) or max
// (1), and [u, v] of the face's UV rectangle (its first or second u and v)
const FACE_CORNERS = {
  up: [[0, 1, 1, 0, 1], [1, 1, 1, 1, 1], [0, 1, 0, 0, 0], [1, 1, 0, 1, 0]],
  down: [[1, 0, 1, 0, 1], [0, 0, 1, 1, 1], [1, 0, 0, 0, 0], [0, 0, 0, 1, 0]],
  east: [[1, 1, 1, 0, 0], [1, 0, 1, 0, 1], [1, 1, 0, 1, 0], [1, 0, 0, 1, 1]],
  west: [[0, 1, 0, 0, 0], [0, 0, 0, 0, 1], [0, 1, 1, 1, 0], [0, 0, 1, 1, 1]],
  north: [[1, 0, 0, 0, 1], [0, 0, 0, 1, 1], [1, 1, 0, 0, 0], [0, 1, 0, 1, 0]],
  south: [[0, 0, 1, 0, 1], [1, 0, 1, 1, 1], [0, 1, 1, 0, 0], [1, 1, 1, 1, 0]]
}

const round = v => Math.round(v * 1000) / 1000

// A box of an entity model (ModelPart's cube: its corner, size and texture offset, in pixels) as an element of a block
// model on a sheet of the given size: each face's UV is the one the game's cube gives the corners of that face. space:
// 'block' for a model drawn in block space as it is (1.15's chests), 'flipped' for one the renderer turns half way
// round x (the classic models: y and z run the other way).
function cubeElement ([x, y, z], [w, h, d], [u, v], sheet, { space = 'block', rotation, faces: only } = {}) {
  // the cube's corners in its own space (y down for a flipped one) and their UVs, as ModelPart.Cube makes its polygons
  const [x0, y0, z0, x1, y1, z1] = [x, y, z, x + w, y + h, z + d]
  const U = [u, u + d, u + d + w, u + d + w + w, u + d + w + d, u + d + w + d + w]
  const V = [v, v + d, v + d + h]
  const P = {
    0: [x0, y0, z0], 1: [x1, y0, z0], 2: [x1, y1, z0], 3: [x0, y1, z0], 4: [x0, y0, z1], 5: [x1, y0, z1], 6: [x1, y1, z1], 7: [x0, y1, z1]
  }
  // (by the side each faces in the cube's own space)
  const polygons = {
    down: [[5, 4, 0, 1], U[1], V[0], U[2], V[1]],
    up: [[2, 3, 7, 6], U[2], V[1], U[3], V[0]],
    west: [[0, 4, 7, 3], U[0], V[1], U[1], V[2]],
    north: [[1, 0, 3, 2], U[1], V[1], U[2], V[2]],
    east: [[5, 1, 2, 6], U[2], V[1], U[4], V[2]],
    south: [[4, 5, 6, 7], U[4], V[1], U[5], V[2]]
  }
  // each face's corners' positions in block space -> their UVs (a flipped cube's faces facing the other way in y and z)
  const toBlock = space === 'flipped' ? ([px, py, pz]) => [px, 16 - py, 16 - pz] : p => p
  const turned = space === 'flipped' ? { up: 'down', down: 'up', north: 'south', south: 'north', west: 'west', east: 'east' } : null
  const uvAt = new Map()
  for (const [side, [corners, ua, va, ub, vb]] of Object.entries(polygons)) {
    const uvs = [[ub, va], [ua, va], [ua, vb], [ub, vb]]
    corners.forEach((c, i) => uvAt.set((turned ? turned[side] : side) + ':' + toBlock(P[c]).join(','), uvs[i]))
  }
  const blockCorners = Object.values(P).map(toBlock)
  const from = [0, 1, 2].map(i => Math.min(...blockCorners.map(c => c[i])))
  const to = [0, 1, 2].map(i => Math.max(...blockCorners.map(c => c[i])))
  const element = { from, to, faces: {} }
  if (rotation) element.rotation = rotation
  for (const [face, corners] of Object.entries(FACE_CORNERS)) {
    if (only && !only.includes(face)) continue
    const uv = [null, null, null, null]
    for (const [cx, cy, cz, cu, cv] of corners) {
      const at = uvAt.get(face + ':' + [cx ? to[0] : from[0], cy ? to[1] : from[1], cz ? to[2] : from[2]].join(','))
      uv[cu ? 2 : 0] = at[0]
      uv[cv ? 3 : 1] = at[1]
    }
    element.faces[face] = { uv: uv.map((c, i) => round(c * 16 / sheet[i % 2])), texture: '#chest' }
  }
  return element
}

// the part of an element from x0 to x1 (block space): its faces' UVs cut to it, an end face only where the part reaches
// that end (along x a face's u runs from its first corner at the east for north and down, at the west for south and up)
function elementPart (element, x0, x1) {
  const { from, to } = element
  const span = to[0] - from[0]
  const out = { ...element, from: [x0, from[1], from[2]], to: [x1, to[1], to[2]], faces: {} }
  for (const [face, f] of Object.entries(element.faces)) {
    if (face === 'east' || face === 'west') {
      if (face === 'east' ? x1 === to[0] : x0 === from[0]) out.faces[face] = f
      continue
    }
    const [u0, v0, u1, v1] = f.uv
    const fromEast = face === 'north' || face === 'down'
    const at = x => round(u0 + (fromEast ? (to[0] - x) : (x - from[0])) / span * (u1 - u0))
    out.faces[face] = { ...f, uv: fromEast ? [at(x1), v0, at(x0), v1] : [at(x0), v0, at(x1), v1] }
  }
  return out
}

const shift = (element, dx) => ({ ...element, from: [element.from[0] + dx, element.from[1], element.from[2]], to: [element.to[0] + dx, element.to[1], element.to[2]] })

// Both models are laid out facing south (the latch at the south side), the lid and latch turning up about the hinge at
// the back (9 up, 1 in) as far as the step says; the variant turns them to the chest's facing.
const lidRotation = step => step ? { origin: [8, 9, 1], axis: 'x', angle: round(-step * 90 / LID_STEPS) } : undefined

// The classic chest (before 1.15: ModelChest, ModelLargeChest, which the renderer turns half way round x): single on the
// single sheet, or the west or east half of the double chest on the double sheet (the boxes 30 wide from x 1, the latch
// between the halves)
function classicChest (half, step) {
  const rotation = lidRotation(step)
  if (!half) {
    return [
      cubeElement([1, 6, 1], [14, 10, 14], [0, 19], [64, 64], { space: 'flipped' }),
      cubeElement([1, 2, 1], [14, 5, 14], [0, 0], [64, 64], { space: 'flipped', rotation }),
      cubeElement([7, 5, 0], [2, 4, 1], [0, 0], [64, 64], { space: 'flipped', rotation })
    ]
  }
  const [x0, x1] = half === 'west' ? [0, 16] : [16, 32]
  return [
    cubeElement([1, 6, 1], [30, 10, 14], [0, 19], [128, 64], { space: 'flipped' }),
    cubeElement([1, 2, 1], [30, 5, 14], [0, 0], [128, 64], { space: 'flipped', rotation }),
    cubeElement([15, 5, 0], [2, 4, 1], [0, 0], [128, 64], { space: 'flipped', rotation })
  ].map(e => shift(elementPart(e, Math.max(e.from[0], x0), Math.min(e.to[0], x1)), -x0))
}

// The chest from 1.15 (ChestModel, drawn in block space): single, or the left half (its latch at its west side, the
// other half to the west) or the right half on their own sheets
function modernChest (half, step) {
  const rotation = lidRotation(step)
  const [x, w, lock] = half === 'left' ? [0, 15, 0] : half === 'right' ? [1, 15, 15] : [1, 14, 7]
  return [
    cubeElement([x, 0, 1], [w, 10, 14], [0, 19], [64, 64]),
    cubeElement([x, 9, 1], [w, 5, 14], [0, 0], [64, 64], { rotation }),
    cubeElement([lock, 7, 15], [half ? 1 : 2, 4, 1], [0, 0], [64, 64], { rotation })
  ]
}

// The chests of a version folder: their textures copied into blocks/, their blockstates and models; the names of the
// chests built
function addChestModels (dir) {
  const statesFile = path.join(dir, 'blocks_states.json')
  const modelsFile = path.join(dir, 'blocks_models.json')
  const chestDir = path.join(dir, 'entity', 'chest')
  if (!fs.existsSync(statesFile) || !fs.existsSync(chestDir)) return []
  const states = JSON.parse(fs.readFileSync(statesFile, 'utf8'))
  const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'))
  const modern = fs.existsSync(path.join(chestDir, 'normal_left.png'))
  // a sheet, copied into blocks/ (the blocks' atlas): its texture name, or null when the version has none
  const sheet = name => {
    const file = path.join(chestDir, name + '.png')
    if (!fs.existsSync(file)) return null
    fs.copyFileSync(file, path.join(dir, 'blocks', `entity__chest__${name}.png`))
    return `minecraft:block/entity__chest__${name}`
  }
  const built = []
  for (const [block, base] of Object.entries(CHESTS)) {
    if (!(block in states)) continue
    const single = sheet(base)
    if (!single) continue
    const pairs = block === 'ender_chest' ? ['none'] : ['none', ...SIDES]
    const halves = modern
      ? { left: sheet(base + '_left'), right: sheet(base + '_right') }
      : { west: sheet(base + '_double'), east: sheet(base + '_double') }
    const variants = {}
    for (const facing of SIDES) {
      // (the variant's turn, clockwise from the model's south)
      const y = { south: 0, west: 90, north: 180, east: 270 }[facing]
      for (const pair of pairs) {
        // (which half this block is, by the side the other half is on as the model is laid out)
        const side = pair === 'none' ? null : SIDES[(SIDES.indexOf(pair) - y / 90 + 4) % 4]
        let half = modern
          ? (side === 'west' ? 'left' : side === 'east' ? 'right' : null)
          : (side === 'east' ? 'west' : side === 'west' ? 'east' : null)
        if (half && !halves[half]) half = null
        for (let step = 0; step <= LID_STEPS; step++) {
          const name = `entity_chest_${base}${half ? '_' + half : ''}_lid${step}`
          const texture = half ? halves[half] : single
          models[name] = { textures: { chest: texture, particle: texture }, elements: modern ? modernChest(half, step) : classicChest(half, step) }
          const key = `facing=${facing}${block === 'ender_chest' ? '' : `,block_entity.pair=${pair}`},block_entity.lid=${step}`
          variants[key] = y ? { model: `minecraft:block/${name}`, y } : { model: `minecraft:block/${name}` }
        }
      }
    }
    states[block] = { variants }
    built.push(block)
  }
  fs.writeFileSync(statesFile, JSON.stringify(states, null, 2))
  fs.writeFileSync(modelsFile, JSON.stringify(models, null, 2))
  return built
}

if (require.main === module) {
  for (const dir of process.argv.slice(2)) console.log(dir, addChestModels(dir).join(' ') || 'no chests')
}

module.exports = { addChestModels, cubeElement, elementPart, LID_STEPS }
