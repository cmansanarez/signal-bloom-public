// MachineLiturgy.js — Signal Bloom
// Scrolling banner layer. Each phrase is simultaneously audience-visible text,
// conceptual cue for the performer, and seed language for AI generation.
//
// M key cycles forward. Phrase transitions are seamless: the pending phrase
// replaces the current one the instant the text loops off-screen left.

// Default phrases are placeholders, not performance material — write your
// own via Shift+M, or edit this array directly for a fixed set.
const PHRASES = [
  'THIS IS A SCROLLING TEXT BANNER.',
  'PRESS M TO TOGGLE IT ON AND OFF.',
  'PRESS N TO ADVANCE TO THE NEXT PHRASE.',
  'PRESS SHIFT+M TO TYPE YOUR OWN PHRASE LIVE.',
  'EACH PHRASE SCROLLS RIGHT TO LEFT, THEN LOOPS.',
  'EDIT THE PHRASES ARRAY IN THIS FILE FOR A FIXED SET INSTEAD.',
]

export class MachineLiturgy {
  constructor() {
    this._banner  = document.getElementById('liturgy-banner')
    this._textEl  = document.getElementById('liturgy-text')
    this._active  = false
    this._x       = 0
    this._speed   = 0      // px/s, recalculated per phrase
    this._raf     = null
    this._last    = null
    this._pending = null   // phrase queued for the next loop point
    this._phraseIdx = 0
  }

  // Trigger a specific text string, or advance to the next liturgy phrase if omitted.
  trigger(phrase) {
    const text = (phrase ?? PHRASES[this._phraseIdx++ % PHRASES.length]).toUpperCase()
    if (this._active) {
      this._pending = text
    } else {
      this._apply(text)
      this._startLoop()
    }
  }

  hide() {
    this._active = false
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null }
    this._banner.style.display = 'none'
    this._pending = null
  }

  // M key: show the banner if hidden, clear it if it's up.
  toggle() {
    if (this._active) this.hide()
    else this.trigger()
  }

  // N key: queue the next phrase (only meaningful while the banner is up).
  // The queued phrase swaps in seamlessly when the current one scrolls off-screen.
  next() {
    if (this._active) this.trigger()
  }

  // Apply phrase text and recalculate speed so every phrase takes ~DURATION seconds
  // for one full traversal (viewport + text width). Ensures predictable pacing regardless
  // of phrase length.
  _apply(text) {
    const DURATION = 27   // seconds per full cycle
    this._banner.style.display = 'block'
    this._textEl.textContent = text
    // offsetWidth is available here because display is now block
    const totalDist = window.innerWidth + this._textEl.offsetWidth
    this._speed = totalDist / DURATION
    this._x = window.innerWidth   // start just off right edge
    this._textEl.style.transform = `translateX(${this._x}px)`
  }

  _startLoop() {
    this._active = true
    this._last   = null
    if (this._raf) cancelAnimationFrame(this._raf)

    const loop = (ts) => {
      if (!this._active) return
      if (this._last === null) this._last = ts
      // Cap dt so a backgrounded tab doesn't cause a position jump on return.
      const dt = Math.min((ts - this._last) / 1000, 0.1)
      this._last = ts

      this._x -= this._speed * dt
      this._textEl.style.transform = `translateX(${this._x}px)`

      // Text has scrolled fully off-screen left — loop and apply any queued phrase.
      if (this._x < -this._textEl.offsetWidth) {
        if (this._pending !== null) {
          this._apply(this._pending)
          this._pending = null
        } else {
          this._x = window.innerWidth
        }
      }

      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }
}

// Expose the full phrase list so external code can use liturgy text as prompt seeds.
export { PHRASES as LITURGY_PHRASES }
