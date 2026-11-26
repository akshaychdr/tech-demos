export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <div className="credits-layer" role="dialog" aria-labelledby="credits-title">
      <article className="credits-card">
        <p className="eyebrow">Credits</p>
        <h2 id="credits-title">Where the anatomy comes from</h2>
        <p>
          The skull, brain, eyes, skin, hand bones, and facial muscles are simplified meshes derived from{' '}
          <a href="https://lifesciencedb.jp/bp3d/">BodyParts3D</a> 3.0 and 4.x, © Database Center for Life
          Science (DBCLS), licensed{' '}
          <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en">CC BY-SA 2.1 Japan</a>. They
          were simplified and re-aligned for this mirror.
        </p>
        <p>
          The muscle layer is the expression muscles from the 3.0 release (frontalis, the orbital and
          palpebral parts of orbicularis oculi, orbicularis oris, zygomaticus major and minor, the upper-lip
          levators, risorius, mentalis, depressor anguli oris, buccinator, nasalis, procerus, masseter, and
          temporalis), placed on the 4.x skull. The frown marker sits on procerus.
        </p>
        <p>
          Face and hand tracking uses MediaPipe Tasks Vision (Apache 2.0). The app code is MIT. Nothing you
          do here is recorded, uploaded, or used for analytics.
        </p>
        <button type="button" className="text-link" onClick={onClose}>
          Close
        </button>
      </article>
    </div>
  )
}
