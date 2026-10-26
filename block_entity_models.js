// Block entities in a version's blocks_states.json and blocks_models.json, besides chests (chest_models.js). The game
// draws these with block entity renderers, so the jar has no model of them (their blockstates name a model with only a
// particle texture, or none at all before 1.13). This builds them from their textures (copied into blocks/ as
// entity__<path>), as those renderers lay their entity models out:
//  - beds (BedRenderer): the head and foot of the bed sheet of its colour (a 1.12 bed's colour is its block entity's:
//    red), turned to its facing
//  - shulker boxes (ShulkerBoxRenderer): base and lid on the sheet of its colour, turned to its facing; its lid rises
//    and turns as far as block_entity.lid says (0 shut to 9 open), which a viewer animates as it does a chest's
//  - signs, wall signs, hanging signs and wall hanging signs (SignRenderer, HangingSignRenderer), on the sheet of their
//    wood, turned by their rotation in steps of 22.5 degrees, or to their facing
//  - banners and wall banners (BannerRenderer): the flag on the banner sheet in its base colour (before 1.13 the block
//    entity's: white), turned likewise
//  - skulls and heads (SkullBlockRenderer): skeleton, wither skeleton, zombie, creeper and player heads on the floor,
//    turned by their rotation, or on a wall (before 1.13 a skull is the skeleton's)
//  - decorated pots, the body of bells, conduits (the shell of an inactive one), end portals and end gateways (their
//    starry texture)
// Rotations of 22.5 degrees are turns of elements of up to 45 degrees, as the block model format allows, under the
// quarter turns of their variants. Dragon and piglin heads and copper golem statues are not built.
//
//   node block_entity_models.js <version folder>...   (a folder image_names.js wrote: blocks_states.json, entity/)
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')
const { LID_STEPS } = require('./chest_models')

const DIRS = ['north', 'east', 'south', 'west']
const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple',
  'blue', 'brown', 'green', 'red', 'black']
// the dyes' colours as the game tints a banner's base with them (DyeColor's texture colours), by COLORS; silver is light
// gray before 1.13
const DYE = Object.fromEntries([0xf9fffe, 0xf9801d, 0xc74ebd, 0x3ab3da, 0xfed83d, 0x80c71f, 0xf38baa, 0x474f52, 0x9d9d97,
  0x169c9c, 0x8932b8, 0x3c44aa, 0x835432, 0x5e7c16, 0xb02e26, 0x1d1d21].map((c, i) => [COLORS[i], c]))
DYE.silver = DYE.light_gray
const WOODS = ['oak', 'spruce', 'birch', 'acacia', 'cherry', 'jungle', 'dark_oak', 'pale_oak', 'mangrove', 'bamboo', 'crimson', 'warped']
// Direction.toYRot(), and the unit step of a horizontal direction
const Y_ROT = { south: 0, west: 90, north: 180, east: 270 }
const STEP = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] }

const round = v => (Math.round(v * 1000) / 1000) || 0
const D = Math.PI / 180

// ---- affine transforms in pixels: [[r00, r01, r02, t0], [r10, r11, r12, t1], [r20, r21, r22, t2]] -------------------

const T = (x, y, z) => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z]]
const S = (x, y, z) => [[x, 0, 0, 0], [0, y, 0, 0], [0, 0, z, 0]]
const RX = a => [[1, 0, 0, 0], [0, Math.cos(a), -Math.sin(a), 0], [0, Math.sin(a), Math.cos(a), 0]]
const RY = a => [[Math.cos(a), 0, Math.sin(a), 0], [0, 1, 0, 0], [-Math.sin(a), 0, Math.cos(a), 0]]
const RZ = a => [[Math.cos(a), -Math.sin(a), 0, 0], [Math.sin(a), Math.cos(a), 0, 0], [0, 0, 1, 0]]
function mul (a, b) {
  return [0, 1, 2].map(i => [0, 1, 2, 3].map(j => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] + (j === 3 ? a[i][3] : 0)))
}
const chain = (...ms) => ms.reduce(mul, T(0, 0, 0))
const apply = (m, [x, y, z]) => [0, 1, 2].map(i => round(m[i][0] * x + m[i][1] * y + m[i][2] * z + m[i][3]))
const turn = (m, [x, y, z]) => [0, 1, 2].map(i => m[i][0] * x + m[i][1] * y + m[i][2] * z)
// a ModelPart's pose: its offset, then its rotation (z, y, x)
const pose = ({ offset = [0, 0, 0], rotation = [0, 0, 0] } = {}) => chain(T(...offset), RZ(rotation[2]), RY(rotation[1]), RX(rotation[0]))

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
const NORMALS = { down: [0, -1, 0], up: [0, 1, 0], west: [-1, 0, 0], north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1] }
function faceOf ([x, y, z]) {
  const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)]
  if (ax >= ay && ax >= az) return x > 0 ? 'east' : 'west'
  if (ay >= az) return y > 0 ? 'up' : 'down'
  return z > 0 ? 'south' : 'north'
}

// A cube of an entity model (ModelPart.Cube: corner, size, texture offset, grown by `grow` on each side) as a block
// model element, by the transform from its part's space to the block's (quarter turns, scales, moves): each face the
// UV the game's cube gives the corners that face ends up at. only: the faces to keep (by the side they face in the
// block); rotation: the element's own turn.
function cubeElement ({ origin: [x, y, z], size: [w, h, d], uv: [u, v], grow = 0 }, matrix, sheet, texture, { only, rotation } = {}) {
  const [x0, y0, z0, x1, y1, z1] = [x - grow, y - grow, z - grow, x + w + grow, y + h + grow, z + d + grow]
  const U = [u, u + d, u + d + w, u + d + w + w, u + d + w + d, u + d + w + d + w]
  const V = [v, v + d, v + d + h]
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
  const polygons = {
    down: [[5, 4, 0, 1], U[1], V[0], U[2], V[1]],
    up: [[2, 3, 7, 6], U[2], V[1], U[3], V[0]],
    west: [[0, 4, 7, 3], U[0], V[1], U[1], V[2]],
    north: [[1, 0, 3, 2], U[1], V[1], U[2], V[2]],
    east: [[5, 1, 2, 6], U[2], V[1], U[4], V[2]],
    south: [[4, 5, 6, 7], U[4], V[1], U[5], V[2]]
  }
  const corners = P.map(p => apply(matrix, p))
  const uvAt = new Map()
  const faces = new Set()
  for (const [side, [ids, ua, va, ub, vb]] of Object.entries(polygons)) {
    const face = faceOf(turn(matrix, NORMALS[side]))
    faces.add(face)
    const uvs = [[ub, va], [ua, va], [ua, vb], [ub, vb]]
    ids.forEach((c, i) => uvAt.set(face + ':' + corners[c].join(','), uvs[i]))
  }
  const from = [0, 1, 2].map(i => Math.min(...corners.map(c => c[i])))
  const to = [0, 1, 2].map(i => Math.max(...corners.map(c => c[i])))
  const element = { from, to, faces: {} }
  if (rotation) element.rotation = rotation
  for (const [face, cs] of Object.entries(FACE_CORNERS)) {
    if (!faces.has(face) || (only && !only.includes(face))) continue
    const ats = cs.map(([cx, cy, cz]) => uvAt.get(face + ':' + [cx ? to[0] : from[0], cy ? to[1] : from[1], cz ? to[2] : from[2]].join(',')))
    if (ats.some(at => !at)) return null
    // (the face's UV rectangle and the rotation that lays it over the corners as the cube does: a face turned a quarter
    // round has its texture turned too)
    const fit = faceUv(cs, ats)
    if (!fit) return null
    element.faces[face] = { uv: fit.uv.map((c, i) => round(c * 16 / sheet[i % 2])), texture: '#' + texture, ...(fit.rotation ? { rotation: fit.rotation } : {}) }
  }
  // (a plane's two sides: the cube has no thickness)
  return element
}

// One turn about y, of `first` (an element rotation: origin, angle in degrees) then `then`: a turn about another
// point by the sum of their angles, or none (a move: `shift`) when they cancel
function combineY (first, then) {
  const R = a => { const r = a * D; return [[Math.cos(r), Math.sin(r)], [-Math.sin(r), Math.cos(r)]] }
  const rot = (m, [x, z]) => [m[0][0] * x + m[0][1] * z, m[1][0] * x + m[1][1] * z]
  const [p, q] = [[first.origin[0], first.origin[2]], [then.origin[0], then.origin[2]]]
  const ra = R(first.angle)
  const rp = rot(ra, p)
  const t = rot(R(then.angle), [p[0] - rp[0] - q[0], p[1] - rp[1] - q[1]]).map((v, i) => v + q[i])
  const angle = first.angle + then.angle
  if (Math.abs(angle % 360) < 1e-6) return { shift: [t[0], 0, t[1]] }
  // (the fixed point c of the turn: (I - R) c = t)
  const r = R(angle)
  const [a, b, c, d] = [1 - r[0][0], -r[0][1], -r[1][0], 1 - r[1][1]]
  const det = a * d - b * c
  const cx = (d * t[0] - b * t[1]) / det
  const cz = (a * t[1] - c * t[0]) / det
  return { rotation: { origin: [round(cx), first.origin[1], round(cz)], axis: 'y', angle: round(angle) } }
}

// The UV rectangle and rotation (0, 90, 180, 270) of a face whose corners (FACE_CORNERS: their [u, v] flags) take the
// UVs ats, as a block model lays a rotated face's UV out: the corner (u, v) turned about the middle of the rectangle
function faceUv (corners, ats) {
  for (const rotation of [0, 90, 180, 270]) {
    const r = rotation * D
    const uv = [null, null, null, null]
    let ok = true
    corners.forEach(([, , , fu, fv], i) => {
      const bu = Math.round((fu - 0.5) * Math.cos(r) + (fv - 0.5) * Math.sin(r) + 0.5)
      const bv = Math.round(-(fu - 0.5) * Math.sin(r) + (fv - 0.5) * Math.cos(r) + 0.5)
      for (const [slot, value] of [[bu ? 2 : 0, ats[i][0]], [bv ? 3 : 1, ats[i][1]]]) {
        if (uv[slot] === null) uv[slot] = value
        else if (Math.abs(uv[slot] - value) > 1e-6) ok = false
      }
    })
    if (ok) return { uv, rotation }
  }
  return null
}

// the elements of a model's parts ({ cubes, offset, rotation }) under a transform
const partElements = (parts, matrix, sheet, texture, opts = {}) =>
  parts.flatMap(p => p.cubes.map(c => cubeElement(c, mul(matrix, pose(p)), sheet, texture, { ...opts, ...p.opts })).filter(Boolean))

// a turn in steps of 22.5 degrees clockwise seen from above (a floor sign's, banner's or head's rotation: the game's
// yRot of -22.5 a step), as the variant's quarter turns (y) and the elements' turn about the middle of the block (of
// -45 to 45 degrees)
function sixteenths (rotation) {
  const quarter = Math.round(rotation / 4)
  const rest = rotation - quarter * 4
  return {
    y: ((quarter * 90) % 360 + 360) % 360,
    rotation: rest ? { origin: [8, 8, 8], axis: 'y', angle: -rest * 22.5 } : undefined
  }
}

// ---- the models --------------------------------------------------------------------------------------------------

// BedRenderer: the head and the foot layers (64 x 64), drawn 9 up, turned a quarter round x, then by the facing
const BED = {
  head: [
    { cubes: [{ origin: [0, 0, 0], size: [16, 16, 6], uv: [0, 0] }] },
    { cubes: [{ origin: [0, 6, 0], size: [3, 3, 3], uv: [50, 6] }], rotation: [Math.PI / 2, 0, Math.PI / 2] },
    { cubes: [{ origin: [-16, 6, 0], size: [3, 3, 3], uv: [50, 18] }], rotation: [Math.PI / 2, 0, Math.PI] }
  ],
  foot: [
    { cubes: [{ origin: [0, 0, 0], size: [16, 16, 6], uv: [0, 22] }] },
    { cubes: [{ origin: [0, 6, -16], size: [3, 3, 3], uv: [50, 0] }], rotation: [Math.PI / 2, 0, 0] },
    { cubes: [{ origin: [-16, 6, -16], size: [3, 3, 3], uv: [50, 12] }], rotation: [Math.PI / 2, 0, Math.PI * 1.5] }
  ]
}
const bedMatrix = facing => chain(T(0, 9, 0), RX(Math.PI / 2), T(8, 8, 8), RZ((180 + Y_ROT[facing]) * D), T(-8, -8, -8))

// ShulkerModel: base and lid (64 x 64); the lid rises half a block and turns three quarters round as it opens
const shulkerParts = step => {
  const open = step / LID_STEPS
  return [
    { cubes: [{ origin: [-8, -8, -8], size: [16, 8, 16], uv: [0, 28] }], offset: [0, 24, 0] },
    { cubes: [{ origin: [-8, -16, -8], size: [16, 12, 16], uv: [0, 0] }], offset: [0, 24 - open * 8, 0], lid: true }
  ]
}
// Direction.getRotation()
const DIRECTION_ROTATION = {
  up: T(0, 0, 0),
  down: RX(Math.PI),
  north: chain(RX(Math.PI / 2), RZ(Math.PI)),
  south: RX(Math.PI / 2),
  west: chain(RX(Math.PI / 2), RZ(Math.PI / 2)),
  east: chain(RX(Math.PI / 2), RZ(-Math.PI / 2))
}

// SignModel (64 x 32): the board and, standing, its stick
const SIGN = [
  { cubes: [{ origin: [-12, -14, -1], size: [24, 12, 2], uv: [0, 0] }] },
  { cubes: [{ origin: [-1, -2, -1], size: [2, 14, 2], uv: [0, 14] }], stick: true }
]
// HangingSignModel (64 x 32): the board, the plank on a wall, and chains: two crossed links each side, or two straight
const HANGING_SIGN = {
  board: { cubes: [{ origin: [-7, 0, -1], size: [14, 10, 2], uv: [0, 12] }] },
  plank: { cubes: [{ origin: [-8, -6, -2], size: [16, 2, 4], uv: [0, 0] }] },
  links: [[-5, 0, -45], [-5, 6, 45], [5, 0, -45], [5, 6, 45]].map(([x, u, angle]) => ({ cubes: [{ origin: [-1.5, 0, 0], size: [3, 6, 0], uv: [u, 6] }], offset: [x, -6, 0], angle })),
  straight: { cubes: [{ origin: [-6, -6, 0], size: [12, 6, 0], uv: [14, 6] }] }
}
// BannerModel (64 x 64): the flag (32 down from its pivot), its crossbar and, standing, its pole
const BANNER = {
  flag: { cubes: [{ origin: [-10, 0, -2], size: [20, 40, 1], uv: [0, 0] }], offset: [0, -32, 0] },
  bar: { cubes: [{ origin: [-10, -32, -1], size: [20, 2, 2], uv: [0, 42] }] },
  pole: { cubes: [{ origin: [-1, -30, -1], size: [2, 42, 2], uv: [44, 0] }] }
}
// SkullModel: the head (8 x 8 x 8), and a humanoid's hat over it (its sheet 64 x 64, a mob head's 64 x 32)
const head = humanoid => [
  { cubes: [{ origin: [-4, -8, -4], size: [8, 8, 8], uv: [0, 0] }, ...(humanoid ? [{ origin: [-4, -8, -4], size: [8, 8, 8], uv: [32, 0], grow: 0.25 }] : [])] }
]
const HEADS = {
  skeleton_skull: { textures: ['entity/skeleton/skeleton'], humanoid: false },
  wither_skeleton_skull: { textures: ['entity/skeleton/wither_skeleton'], humanoid: false },
  zombie_head: { textures: ['entity/zombie/zombie'], humanoid: true },
  creeper_head: { textures: ['entity/creeper/creeper'], humanoid: false },
  player_head: { textures: ['entity/player/wide/steve', 'entity/steve'], humanoid: true }
}

// ---- a version folder --------------------------------------------------------------------------------------------

function addBlockEntityModels (dir) {
  const statesFile = path.join(dir, 'blocks_states.json')
  const modelsFile = path.join(dir, 'blocks_models.json')
  if (!fs.existsSync(statesFile) || !fs.existsSync(path.join(dir, 'entity'))) return []
  const states = JSON.parse(fs.readFileSync(statesFile, 'utf8'))
  const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'))
  const has = name => name in states
  // the first of the textures (paths under the folder, without .png) the version has, copied into blocks/: its name
  // there, or null
  const texture = candidates => {
    for (const p of [].concat(candidates)) {
      const file = path.join(dir, p + '.png')
      if (!fs.existsSync(file)) continue
      const name = p.replace(/\//g, '__')
      fs.copyFileSync(file, path.join(dir, 'blocks', name + '.png'))
      return 'minecraft:block/' + name
    }
    return null
  }
  const built = []
  const model = (name, elements, textures) => {
    models[name] = { textures: { ...textures, particle: Object.values(textures)[0] }, elements }
    return 'minecraft:block/' + name
  }
  const variant = (ref, y = 0, x = 0) => ({ model: ref, ...(x ? { x } : {}), ...(y ? { y } : {}) })

  // beds: <colour>_bed (facing, part), before 1.13 bed
  for (const color of [...COLORS, null]) {
    const name = color ? color + '_bed' : 'bed'
    if (!has(name)) continue
    const sheet = texture(`entity/bed/${color ?? 'red'}`)
    if (!sheet) continue
    const variants = {}
    for (const part of ['head', 'foot']) {
      for (const facing of DIRS) {
        const ref = model(`entity_bed_${color ?? 'red'}_${part}_${facing}`, partElements(BED[part], bedMatrix(facing), [64, 64], 'bed'), { bed: sheet })
        variants[`facing=${facing},part=${part}`] = variant(ref)
      }
    }
    states[name] = { variants }
    built.push(name)
  }

  // shulker boxes: shulker_box, <colour>_shulker_box (facing; block_entity.lid)
  for (const color of [null, ...COLORS, 'silver']) {
    const name = color ? color + '_shulker_box' : 'shulker_box'
    if (!has(name)) continue
    const sheet = texture(color ? [`entity/shulker/shulker_${color}`, ...(color === 'light_gray' ? ['entity/shulker/shulker_silver'] : [])] : 'entity/shulker/shulker')
    if (!sheet) continue
    const variants = {}
    for (const facing of ['up', 'down', ...DIRS]) {
      const base = chain(T(8, 8, 8), DIRECTION_ROTATION[facing], S(1, -1, -1), T(0, -16, 0))
      for (let step = 0; step <= LID_STEPS; step++) {
        const elements = []
        for (const part of shulkerParts(step)) {
          const m = mul(base, pose(part))
          // (the lid turns about its axis, the box's facing; three quarters at most)
          let rotation
          if (part.lid && step) {
            const axisVec = turn(base, [0, 1, 0])
            const axis = Math.abs(axisVec[0]) > 0.5 ? 'x' : Math.abs(axisVec[1]) > 0.5 ? 'y' : 'z'
            const sign = axisVec[{ x: 0, y: 1, z: 2 }[axis]] > 0 ? 1 : -1
            rotation = { origin: apply(m, [0, 0, 0]), axis, angle: round(sign * 270 * step / LID_STEPS) }
          }
          elements.push(...part.cubes.map(c => cubeElement(c, m, [64, 64], 'shulker', { rotation })).filter(Boolean))
        }
        const ref = model(`entity_shulker_${color ?? 'default'}_${facing}_lid${step}`, elements, { shulker: sheet })
        variants[`facing=${facing},block_entity.lid=${step}`] = variant(ref)
      }
    }
    states[name] = { variants }
    built.push(name)
  }

  // signs: <wood>_sign (rotation), <wood>_wall_sign (facing); before 1.14 sign / standing_sign and wall_sign
  for (const wood of [...WOODS, null]) {
    for (const wall of [false, true]) {
      const name = wood ? `${wood}_${wall ? 'wall_sign' : 'sign'}` : null
      const names = name ? [name] : (wall ? ['wall_sign'] : ['sign', 'standing_sign'])
      for (const block of names) {
        if (!has(block)) continue
        const sheet = texture(wood ? [`entity/signs/${wood}`, ...(wood === 'oak' ? ['entity/sign'] : [])] : 'entity/sign')
        if (!sheet) continue
        const variants = {}
        const k = 2 / 3
        if (wall) {
          for (const facing of DIRS) {
            const m = chain(T(8, 8, 8), RY(-Y_ROT[facing] * D), T(0, -5, -7), S(k, -k, -k))
            const ref = model(`entity_sign_${wood ?? 'legacy'}_wall_${facing}`, partElements(SIGN.filter(p => !p.stick), m, [64, 32], 'sign'), { sign: sheet })
            variants[`facing=${facing}`] = variant(ref)
          }
        } else {
          const m = chain(T(8, 8, 8), S(k, -k, -k))
          for (let rotation = 0; rotation < 16; rotation++) {
            const t = sixteenths(rotation)
            const ref = model(`entity_sign_${wood ?? 'legacy'}_${(rotation - Math.round(rotation / 4) * 4) + 2}`, partElements(SIGN, m, [64, 32], 'sign', { rotation: t.rotation }), { sign: sheet })
            variants[`rotation=${rotation}`] = variant(ref, t.y)
          }
        }
        states[block] = { variants }
        built.push(block)
      }
    }
  }

  // hanging signs: <wood>_hanging_sign (rotation, attached), <wood>_wall_hanging_sign (facing)
  for (const wood of WOODS) {
    for (const wall of [false, true]) {
      const block = `${wood}_${wall ? 'wall_hanging_sign' : 'hanging_sign'}`
      if (!has(block)) continue
      const sheet = texture(`entity/signs/hanging/${wood}`)
      if (!sheet) continue
      const elementsOf = (attached, rest) => {
        const m = chain(T(8, 15, 8), T(0, -5, 0), S(1, -1, -1))
        const parts = [HANGING_SIGN.board, ...(wall ? [HANGING_SIGN.plank] : []), ...(attached ? [HANGING_SIGN.straight] : [])]
        const out = partElements(parts, m, [64, 32], 'sign', { rotation: rest })
        if (!attached) {
          for (const link of HANGING_SIGN.links) {
            // (each link crossed 45 degrees about its own pivot, the model's y and z running the other way so the other
            // way round; then the sign's own turn about the middle of the block)
            const own = { origin: apply(m, link.offset), axis: 'y', angle: -link.angle }
            const both = rest ? combineY(own, rest) : { rotation: own }
            for (const el of partElements([{ cubes: link.cubes, offset: link.offset }], m, [64, 32], 'sign')) {
              if (both.rotation) el.rotation = both.rotation
              else { el.from = el.from.map((v, i) => round(v + both.shift[i])); el.to = el.to.map((v, i) => round(v + both.shift[i])) }
              out.push(el)
            }
          }
        }
        return out
      }
      const variants = {}
      if (wall) {
        for (const facing of DIRS) {
          const ref = model(`entity_hanging_sign_${wood}_wall`, elementsOf(false), { sign: sheet })
          variants[`facing=${facing}`] = variant(ref, Y_ROT[facing])
        }
      } else {
        for (const attached of [false, true]) {
          for (let rotation = 0; rotation < 16; rotation++) {
            const t = sixteenths(rotation)
            const rest = (rotation - Math.round(rotation / 4) * 4)
            const ref = model(`entity_hanging_sign_${wood}_${attached ? 'attached' : 'chains'}_${rest + 2}`, elementsOf(attached, t.rotation), { sign: sheet })
            variants[`attached=${attached},rotation=${rotation}`] = variant(ref, t.y)
          }
        }
      }
      states[block] = { variants }
      built.push(block)
    }
  }

  // banners: <colour>_banner (rotation), <colour>_wall_banner (facing); before 1.13 standing_banner and wall_banner
  const bannerBase = path.join(dir, fs.existsSync(path.join(dir, 'entity/banner_base.png')) ? 'entity/banner_base.png' : 'entity/banner/banner_base.png')
  const basePattern = path.join(dir, 'entity/banner/base.png')
  const bannerSheet = color => {
    if (!fs.existsSync(bannerBase)) return null
    const name = `entity__banner__${color}_base`
    const out = PNG.sync.read(fs.readFileSync(bannerBase))
    if (fs.existsSync(basePattern)) {
      // (the base pattern in the colour, over the sheet's flag, as the game draws a banner's first layer)
      const layer = PNG.sync.read(fs.readFileSync(basePattern))
      const c = [(DYE[color] >> 16) & 255, (DYE[color] >> 8) & 255, DYE[color] & 255]
      for (let i = 0; i < out.data.length && i < layer.data.length; i += 4) {
        const a = layer.data[i + 3] / 255
        if (!a) continue
        for (let j = 0; j < 3; j++) out.data[i + j] = Math.round(layer.data[i + j] * c[j] / 255 * a + out.data[i + j] * (1 - a))
        out.data[i + 3] = Math.max(out.data[i + 3], layer.data[i + 3])
      }
    }
    fs.writeFileSync(path.join(dir, 'blocks', name + '.png'), PNG.sync.write(out))
    return 'minecraft:block/' + name
  }
  for (const color of [...COLORS, null]) {
    for (const wall of [false, true]) {
      const block = color ? `${color}_${wall ? 'wall_banner' : 'banner'}` : (wall ? 'wall_banner' : 'standing_banner')
      if (!has(block)) continue
      const sheet = bannerSheet(color ?? 'white')
      if (!sheet) continue
      const k = 2 / 3
      const variants = {}
      if (wall) {
        for (const facing of DIRS) {
          const m = chain(T(8, -8 / 3, 8), RY(-Y_ROT[facing] * D), T(0, -5, -7), S(k, -k, -k))
          const ref = model(`entity_banner_${color ?? 'white'}_wall_${facing}`, partElements([BANNER.flag, BANNER.bar], m, [64, 64], 'banner'), { banner: sheet })
          variants[`facing=${facing}`] = variant(ref)
        }
      } else {
        const m = chain(T(8, 8, 8), S(k, -k, -k))
        for (let rotation = 0; rotation < 16; rotation++) {
          const t = sixteenths(rotation)
          const ref = model(`entity_banner_${color ?? 'white'}_${(rotation - Math.round(rotation / 4) * 4) + 2}`, partElements([BANNER.flag, BANNER.bar, BANNER.pole], m, [64, 64], 'banner', { rotation: t.rotation }), { banner: sheet })
          variants[`rotation=${rotation}`] = variant(ref, t.y)
        }
      }
      states[block] = { variants }
      built.push(block)
    }
  }

  // heads: <type>_skull / <type>_head (rotation), the wall ones (facing); before 1.13 skull (facing), a skeleton's
  const headEntries = Object.entries(HEADS).flatMap(([floor, h]) => [[floor, h, false], [floor.replace(/_(skull|head)$/, '_wall_$1'), h, true]])
  headEntries.push(['skull', HEADS.skeleton_skull, null])
  for (const [block, h, wall] of headEntries) {
    if (!has(block)) continue
    const sheet = texture(h.textures)
    if (!sheet) continue
    const size = h.humanoid ? [64, 64] : [64, 32]
    const variants = {}
    const wallModel = facing => {
      const [sx, , sz] = STEP[facing]
      // (the game turns a wall head's head part to the opposite of its facing: yRot about its pivot)
      const m = chain(T(8 - sx * 4, 4, 8 - sz * 4), S(-1, -1, 1), RY((Y_ROT[facing] + 180) * D))
      return model(`entity_head_${block.replace(/_wall/, '')}_wall_${facing}`, partElements(head(h.humanoid), m, size, 'head'), { head: sheet })
    }
    if (wall === true || wall === null) {
      for (const facing of DIRS) variants[`facing=${facing}`] = variant(wallModel(facing))
      if (wall === null) {
        // (before 1.13 a skull on the floor faces up; its rotation is its block entity's)
        const ref = model('entity_head_skull_floor', partElements(head(false), chain(T(8, 0, 8), S(-1, -1, 1)), size, 'head'), { head: sheet })
        variants['facing=up'] = variant(ref)
      }
    } else {
      const m = chain(T(8, 0, 8), S(-1, -1, 1))
      for (let rotation = 0; rotation < 16; rotation++) {
        // (the head part turned by the rotation: under the model's half turn round z, the same way round as a sign)
        const t = sixteenths(rotation)
        const ref = model(`entity_head_${block}_${(rotation - Math.round(rotation / 4) * 4) + 2}`, partElements(head(h.humanoid), m, size, 'head', { rotation: t.rotation }), { head: sheet })
        variants[`rotation=${rotation}`] = variant(ref, t.y)
      }
    }
    states[block] = { variants }
    built.push(block)
  }

  // decorated pots: the body (its sides the side texture, top and bottom on the base sheet), neck and rim
  if (has('decorated_pot')) {
    const side = texture('entity/decorated_pot/decorated_pot_side')
    const base = texture('entity/decorated_pot/decorated_pot_base')
    if (side && base) {
      const b = [32, 32]
      const sheet = ([u0, v0, u1, v1]) => [u0, v0, u1, v1].map((c, i) => round(c * 16 / b[i % 2]))
      const body = { from: [1, 0, 1], to: [15, 16, 15], faces: {} }
      for (const dir of DIRS) body.faces[dir] = { texture: '#side', uv: [1, 0, 15, 16] }
      body.faces.up = { texture: '#base', uv: sheet([14, 27, 28, 13]) }
      body.faces.down = { texture: '#base', uv: sheet([0, 13, 14, 27]) }
      const neckMatrix = chain(T(0, 37, 16), RX(Math.PI))
      const elements = [
        body,
        cubeElement({ origin: [5, 20, 5], size: [6, 1, 6], uv: [0, 5], grow: 0.2 }, neckMatrix, b, 'base'),
        cubeElement({ origin: [4, 17, 4], size: [8, 3, 8], uv: [0, 0], grow: -0.1 }, neckMatrix, b, 'base')
      ].filter(Boolean)
      const ref = model('entity_decorated_pot', elements, { side, base })
      const variants = {}
      for (const facing of DIRS) variants[`facing=${facing}`] = variant(ref, (Y_ROT[facing] + 180) % 360)
      states.decorated_pot = { variants }
      built.push('decorated_pot')
    }
  }

  // bells: the bell (its body and lip) added to the frame of each of its models
  if (has('bell')) {
    const body = texture('entity/bell/bell_body')
    if (body) {
      const elements = [
        cubeElement({ origin: [-3, -6, -3], size: [6, 7, 6], uv: [0, 0] }, T(8, 12, 8), [32, 32], 'bell'),
        cubeElement({ origin: [4, 4, 4], size: [8, 2, 8], uv: [0, 13] }, T(0, 0, 0), [32, 32], 'bell')
      ].filter(Boolean)
      const refs = new Set()
      for (const v of Object.values(states.bell.variants ?? {})) refs.add((Array.isArray(v) ? v[0] : v).model.replace(/^minecraft:block\//, ''))
      for (const name of refs) {
        const m = models[name]
        if (!m || m.elements?.some(e => Object.values(e.faces).some(f => f.texture === '#bell'))) continue
        m.textures = { ...m.textures, bell: body }
        m.elements = [...(m.elements ?? []), ...elements]
      }
      built.push('bell')
    }
  }

  // conduits: the shell of an inactive one, in the middle of the block
  if (has('conduit')) {
    const shell = texture('entity/conduit/base')
    if (shell) {
      const ref = model('entity_conduit', [cubeElement({ origin: [-3, -3, -3], size: [6, 6, 6], uv: [0, 0] }, T(8, 8, 8), [32, 16], 'conduit')], { conduit: shell })
      states.conduit = { variants: { '': variant(ref) } }
      built.push('conduit')
    }
  }

  // end portals and gateways: their starry texture, a portal's top 3/4 up, a gateway's every face
  const sky = texture(['entity/end_portal', 'entity/end_portal/end_portal'])
  if (sky) {
    const all = Object.fromEntries(['down', 'up', ...DIRS].map(f => [f, { texture: '#sky', uv: [0, 0, 16, 16] }]))
    if (has('end_portal')) {
      const ref = model('entity_end_portal', [{ from: [0, 12, 0], to: [16, 12, 16], faces: { up: all.up, down: all.down } }], { sky })
      states.end_portal = { variants: { '': variant(ref) } }
      built.push('end_portal')
    }
    if (has('end_gateway')) {
      const ref = model('entity_end_gateway', [{ from: [0, 0, 0], to: [16, 16, 16], faces: all }], { sky })
      states.end_gateway = { variants: { '': variant(ref) } }
      built.push('end_gateway')
    }
  }

  fs.writeFileSync(statesFile, JSON.stringify(states, null, 2))
  fs.writeFileSync(modelsFile, JSON.stringify(models, null, 2))
  return built
}

if (require.main === module) {
  for (const dir of process.argv.slice(2)) console.log(dir, addBlockEntityModels(dir).length, 'blocks')
}

module.exports = { addBlockEntityModels, cubeElement, sixteenths }
