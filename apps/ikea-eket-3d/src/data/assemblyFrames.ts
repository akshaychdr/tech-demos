/** Manual-mirrored assembly frames (context + close-up sub-steps). */
export type Vec3 = [number, number, number]

export type ManualRegion = { x: number; y: number; w: number; h: number }

export type HardwareAction = {
  partId: string
  label: string
  count: number
  nodes: string[]
  insertAxis: 'x' | 'y' | 'z'
  insertM: number
  rotate?: { axis: 'x' | 'y' | 'z'; turns: number; clockwise: boolean }
}

export type AssemblyFrame = {
  stepId: number
  subId: string
  title: string
  phase: 'flatpack' | 'context' | 'closeup' | 'finish'
  manualPage: number
  manualRegion?: ManualRegion
  placedThroughStep: number
  activeNodes: string[]
  pulseNodes?: string[]
  hardware?: HardwareAction
  flatpackPage?: 0 | 1 | 2
  camera: { position: Vec3; target: Vec3 }
  assemblyRotation?: Vec3
  fill?: number
}

const CAM = {
  front34: { position: [0.5, 0.26, 0.46] as Vec3, target: [0.02, 0.07, 0] as Vec3 },
  back34: { position: [-0.5, 0.26, -0.46] as Vec3, target: [0.02, 0.07, 0] as Vec3 },
  topOpen: { position: [0.06, 0.58, 0.22] as Vec3, target: [0.02, 0.08, 0] as Vec3 },
  sideRight: { position: [0.58, 0.18, 0.02] as Vec3, target: [0.02, 0.07, 0] as Vec3 },
  flatIso: { position: [0.9, 1.05, 0.85] as Vec3, target: [0, 0, 0.35] as Vec3 },
  drawerFront: { position: [0.42, 0.2, 0.38] as Vec3, target: [0.12, 0.05, 0.02] as Vec3 },
}

function ctx(stepId: number, subId: string, title: string, page: number, placed: number, nodes: string[], cam: typeof CAM.front34, extra?: Partial<AssemblyFrame>): AssemblyFrame {
  return {
    stepId,
    subId,
    title,
    phase: 'context',
    manualPage: page,
    placedThroughStep: placed,
    activeNodes: nodes,
    camera: cam,
    fill: 0.72,
    ...extra,
  }
}

function cu(
  stepId: number,
  subId: string,
  title: string,
  page: number,
  placed: number,
  hw: HardwareAction,
  cam: typeof CAM.front34,
  region?: ManualRegion,
): AssemblyFrame {
  return {
    stepId,
    subId,
    title,
    phase: 'closeup',
    manualPage: page,
    manualRegion: region,
    placedThroughStep: placed,
    activeNodes: hw.nodes,
    pulseNodes: hw.nodes,
    hardware: hw,
    camera: cam,
    fill: 0.7,
  }
}

export const assemblyFrames: AssemblyFrame[] = [
  {
    stepId: 0,
    subId: '0a',
    title: 'Panels',
    phase: 'flatpack',
    manualPage: 7,
    manualRegion: { x: 0.08, y: 0.52, w: 0.84, h: 0.22 },
    placedThroughStep: 0,
    activeNodes: [],
    flatpackPage: 0,
    camera: CAM.flatIso,
    fill: 0.8,
  },
  {
    stepId: 0,
    subId: '0b',
    title: 'Drawer kits',
    phase: 'flatpack',
    manualPage: 7,
    placedThroughStep: 0,
    activeNodes: [],
    flatpackPage: 1,
    camera: CAM.flatIso,
    fill: 0.8,
  },
  {
    stepId: 0,
    subId: '0c',
    title: 'Hardware tray',
    phase: 'flatpack',
    manualPage: 7,
    manualRegion: { x: 0.06, y: 0.06, w: 0.88, h: 0.38 },
    placedThroughStep: 0,
    activeNodes: [],
    flatpackPage: 2,
    camera: CAM.flatIso,
    fill: 0.8,
  },
  ctx(1, '1', 'Bottom panel — position', 13, 0, ['bottom panel dr ut 70x35_02'], CAM.topOpen, {
    manualRegion: { x: 0.05, y: 0.55, w: 0.9, h: 0.35 },
    assemblyRotation: [0, 0, 0],
  }),
  ctx(2, '2', 'Side panels — upright', 13, 1, ['side panel left dr ut 70x35_01', 'side panel right dr ut 70x35_05'], CAM.front34, {
    manualRegion: { x: 0.05, y: 0.08, w: 0.9, h: 0.45 },
  }),
  ctx(3, '3a', 'Dowels — where they go', 13, 2, ['100349_01', '100349_02', '100349_03', '100349_04'], CAM.front34, {
    pulseNodes: ['100349_01', '100349_02', '100349_03', '100349_04'],
    manualRegion: { x: 0.02, y: 0.55, w: 0.5, h: 0.4 },
  }),
  cu(
    3,
    '3b',
    'Dowel — press in',
    13,
    2,
    {
      partId: '100349',
      label: 'Wooden dowel',
      count: 8,
      nodes: ['100349_01'],
      insertAxis: 'y',
      insertM: 0.028,
    },
    { position: [0.14, 0.12, 0.18], target: [0.06, 0.07, 0.04] },
    { x: 0.0, y: 0.55, w: 0.48, h: 0.4 },
  ),
  ctx(4, '4', 'Back panel — rear view', 13, 3, ['back panel 35x25 dr_01'], CAM.back34, {
    manualRegion: { x: 0.05, y: 0.12, w: 0.9, h: 0.55 },
  }),
  ctx(5, '5', 'Top panel — clamp', 14, 4, ['top panel dr ut 70x35_02'], CAM.topOpen),
  ctx(6, '6a', 'Frame connectors — back', 16, 5, ['139434_01', '139434_02', '139434_03', '139434_04'], CAM.back34, {
    pulseNodes: ['139434_01', '139434_02'],
    manualRegion: { x: 0.04, y: 0.08, w: 0.92, h: 0.5 },
  }),
  cu(
    6,
    '6b',
    'Connector — snap in',
    16,
    5,
    {
      partId: '139434',
      label: 'Connector',
      count: 8,
      nodes: ['139434_01'],
      insertAxis: 'z',
      insertM: 0.022,
    },
    { position: [-0.12, 0.11, -0.2], target: [-0.04, 0.07, -0.08] },
    { x: 0.1, y: 0.55, w: 0.35, h: 0.35 },
  ),
  ctx(7, '7a', 'Wall fittings — back', 19, 6, ['141413_01', '141413_02'], CAM.back34, {
    pulseNodes: ['141413_01', '141413_02'],
    manualRegion: { x: 0.04, y: 0.32, w: 0.92, h: 0.32 },
  }),
  cu(
    7,
    '7b',
    'Wall fitting — screw',
    20,
    6,
    {
      partId: '141413',
      label: 'Wall fitting',
      count: 2,
      nodes: ['141413_01'],
      insertAxis: 'z',
      insertM: 0.02,
      rotate: { axis: 'z', turns: 2, clockwise: true },
    },
    { position: [-0.14, 0.14, -0.18], target: [-0.05, 0.09, -0.07] },
    { x: 0.5, y: 0.48, w: 0.46, h: 0.36 },
  ),
  ctx(8, '8', 'Drawer 1 — box parts', 19, 7, [
    '109041_01',
    '109041_02',
    '120161_01',
    '120162_01',
    'Drawer Back cs 652x110x12_01',
    'Drawer Side R cs 278,5x110x12_01',
    'Drawer Side cs L 278,5x110x12_01',
    'drawer bottom 70x35_01',
    'drawer front small 70x35_01',
  ], CAM.drawerFront),
  ctx(9, '9a', 'Drawer 1 — screw locations', 11, 8, ['110519_01', '128918_01'], CAM.drawerFront, {
    pulseNodes: ['110519_01', '128918_01'],
    manualRegion: { x: 0.06, y: 0.06, w: 0.88, h: 0.42 },
  }),
  cu(
    9,
    '9b',
    'Screw — tighten',
    11,
    8,
    {
      partId: '110519',
      label: 'Screw',
      count: 4,
      nodes: ['110519_01'],
      insertAxis: 'y',
      insertM: 0.018,
      rotate: { axis: 'y', turns: 1.5, clockwise: true },
    },
    { position: [0.28, 0.14, 0.32], target: [0.14, 0.07, 0.1] },
    { x: 0.06, y: 0.08, w: 0.88, h: 0.4 },
  ),
  ctx(10, '10', 'Drawer 2 — box', 21, 9, [
    '109041_05',
    '109041_06',
    '120161_02',
    '120162_02',
    'Drawer Back cs 652x110x12_02',
    'drawer bottom 70x35_02',
    'drawer front small 70x35_02',
  ], CAM.drawerFront),
  ctx(11, '11a', 'Drawer 2 — fasteners', 21, 10, ['110519_05', '128918_05'], CAM.drawerFront, {
    pulseNodes: ['110519_05'],
  }),
  cu(
    11,
    '11b',
    'Plug — press',
    21,
    10,
    {
      partId: '128918',
      label: 'Plug',
      count: 4,
      nodes: ['128918_05'],
      insertAxis: 'y',
      insertM: 0.016,
    },
    { position: [0.18, 0.1, 0.2], target: [0.11, 0.05, 0.07] },
  ),
  ctx(12, '12a', 'Slides — lay out', 8, 11, ['145568_01', '145569_01', '147222_01'], CAM.sideRight, {
    manualRegion: { x: 0.05, y: 0.15, w: 0.9, h: 0.7 },
    pulseNodes: ['145568_01', '145569_01', '147222_01'],
  }),
  cu(
    12,
    '12b',
    'Slide rail — fix',
    9,
    11,
    {
      partId: '147222',
      label: 'Slide clip',
      count: 4,
      nodes: ['147222_01'],
      insertAxis: 'x',
      insertM: 0.02,
      rotate: { axis: 'x', turns: 1, clockwise: false },
    },
    { position: [0.32, 0.1, 0.06], target: [0.14, 0.06, 0.02] },
    { x: 0.02, y: 0.06, w: 0.55, h: 0.38 },
  ),
  ctx(13, '13', 'Mount slides to carcass', 9, 12, [
    'Drawer_slide_L_Cabinet-01721866__150592_1_01',
    'Drawer_slide_L_Cabinet-01721866__150592_1_02',
    'Drawer_slide_R_Cabinet-01721810_150593_1_01',
    'Drawer_slide_R_Cabinet-01721810_150593_1_02',
  ], CAM.sideRight, {
    pulseNodes: [
      'Drawer_slide_L_Cabinet-01721866__150592_1_01',
      'Drawer_slide_R_Cabinet-01721810_150593_1_01',
    ],
  }),
  ctx(14, '14', 'Secure to wall — back', 25, 13, [], CAM.back34),
  ctx(15, '15a', 'Finished cabinet — front', 22, 14, [], CAM.front34, { fill: 0.78 }),
  {
    stepId: 15,
    subId: '15b',
    title: 'Open both drawers',
    phase: 'finish',
    manualPage: 22,
    manualRegion: { x: 0.1, y: 0.12, w: 0.8, h: 0.55 },
    placedThroughStep: 14,
    activeNodes: [],
    camera: CAM.front34,
    fill: 0.82,
  },
]

export function frameCount() {
  return assemblyFrames.length
}
