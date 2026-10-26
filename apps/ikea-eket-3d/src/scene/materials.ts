import * as THREE from 'three'
import { isHardwareName, partKind } from './partKind'
import { partNameForMatch } from './partNames'

const IKEA_WHITE = 0xf5f3f0
const IKEA_EDGE = 0xe8e4de

export function enhanceCatalogMaterials(partRoots: Map<string, THREE.Object3D>) {
  for (const [name, root] of partRoots) {
    const kind = partKind(name)
    const match = partNameForMatch(name)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const src = mesh.material as THREE.MeshStandardMaterial
      if (!src?.isMeshStandardMaterial) return

      const mat = src.clone()
      if (isHardwareName(name)) {
        const id = name.split('_')[0]
        const metal = ['109041', '110519', '128918', '139434', '141413', '145572'].includes(id)
        mat.color.setHex(metal ? 0x8a8a8a : 0xc4a574)
        mat.metalness = metal ? 0.55 : 0.08
        mat.roughness = metal ? 0.38 : 0.72
        mat.envMapIntensity = 0.85
      } else if (kind === 'panel' || match.includes('drawer front') || match.includes('drawer bottom')) {
        mat.color.setHex(IKEA_WHITE)
        mat.metalness = 0.02
        mat.roughness = 0.88
        mat.envMapIntensity = 1.05
      } else if (kind === 'drawer' || kind === 'slide') {
        mat.color.setHex(match.includes('front') ? IKEA_WHITE : 0xddd8d0)
        mat.metalness = kind === 'slide' ? 0.35 : 0.04
        mat.roughness = kind === 'slide' ? 0.45 : 0.82
        mat.envMapIntensity = 0.95
      } else {
        mat.envMapIntensity = 0.9
      }
      mat.emissive.setHex(0x000000)
      mat.emissiveIntensity = 0
      mesh.material = mat
    })
  }
}

export function addPanelEdgeLines(partRoots: Map<string, THREE.Object3D>) {
  for (const [name, root] of partRoots) {
    if (partKind(name) !== 'panel') continue
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry, 22),
        new THREE.LineBasicMaterial({ color: IKEA_EDGE, transparent: true, opacity: 0.28 }),
      )
      mesh.add(line)
    })
  }
}
