export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <div className="credits-layer" role="dialog" aria-labelledby="credits-title">
      <article className="credits-card">
        <p className="eyebrow">Credits</p>
        <h2 id="credits-title">Where the anatomy comes from</h2>
        <p>
          Skull bones and the brain shell are simplified meshes derived from{' '}
          <a href="https://lifesciencedb.jp/bp3d/">BodyParts3D</a>, © Database Center for Life Science (DBCLS),
          licensed{' '}
          <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en">CC BY-SA 2.1 Japan</a>.
        </p>
        <p>
          BodyParts3D 4.3 does not include meshes for the five expression muscles in this app. Those five
          shapes are original schematic ribbons, drawn where each muscle sits, and shipped in the same
          anatomy file under CC BY-SA 2.1 Japan.
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
