export default function App() {
  return (
    <div
      className="bg-[#040810]"
      style={{ width: 1920, height: 1080, margin: '0 auto', overflow: 'hidden' }}
    >
      <iframe
        data-testid="reel-embed"
        src="/composition/index.html"
        title="Elevator selective collective — HyperFrames reel"
        width={1920}
        height={1080}
        style={{ border: 'none', display: 'block', width: 1920, height: 1080 }}
      />
    </div>
  )
}
