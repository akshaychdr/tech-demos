const slides = Array.from(document.querySelectorAll('.slide'))
const tl = gsap.timeline({ paused: true })

gsap.set(slides[0], { opacity: 1 })
tl.to({}, { duration: 4 })

const beats = [
  { index: 1, at: 4 },
  { index: 2, at: 32 },
  { index: 3, at: 58 },
  { index: 4, at: 76 },
]

beats.forEach(({ index, at }) => {
  tl.to(slides[index - 1], { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, at)
  tl.to(slides[index], { opacity: 1, duration: 0.8, ease: 'power2.inOut' }, at)
})
tl.to({}, { duration: 8 })

window.__timelines = window.__timelines || {}
window.__timelines['elevator-install-3d'] = tl
