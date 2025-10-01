export class PlaybackBuffer {
  constructor(maxEntries = 70000, serverFps = 10.0) {
    this.buf = [];
  }

  push(players, opts = {}) {
    const entry = {
      players,
      videoTime: typeof opts.videoTime === "number" ? opts.videoTime : null,
    };
    this.buf.push(entry);
  }

  last() {
    return this.buf.length ? this.buf[this.buf.length - 1] : null;
  }

  first() {
    return this.buf.length ? this.buf[0] : null;
  }

  frameForFraction(frac) {
    if (!this.buf.length) return null;
    const start = this.first().videoTime;
    const end = this.last().videoTime;
    if (end === start) return this.last();
    const target = start + frac * (end - start);
    // Note: We don't need findFrameForVideoTime anymore, as the render loop handles it.
    // This is just for the slider drag. We can use the more robust interpolation search.
    const frames = this.findFramesForInterpolation(target);
    return frames ? frames.prev : this.first();
  }

  timeSpan() {
    if (!this.buf.length) return { start: 0, end: 0 };
    return { start: this.first().videoTime, end: this.last().videoTime };
  }

  // --- REVISED AND CORRECTED INTERPOLATION SEARCH ---
  findFramesForInterpolation(videoTime) {
    if (this.buf.length < 2) return null;

    const first = this.first();
    if (videoTime <= first.videoTime) {
      return { prev: first, next: this.buf[1] || first };
    }

    const last = this.last();
    if (videoTime >= last.videoTime) {
      return { prev: last, next: last };
    }

    // --- SIMPLE AND RELIABLE LINEAR SEARCH ---
    // This replaces the buggy binary search.
    for (let i = 0; i < this.buf.length - 1; i++) {
      const current = this.buf[i];
      const next = this.buf[i + 1];

      // Find the two frames that the current time falls between.
      if (videoTime >= current.videoTime && videoTime < next.videoTime) {
        return { prev: current, next: next };
      }
    }

    // Fallback if something goes wrong (should not be reached)
    return { prev: last, next: last };
  }
}
