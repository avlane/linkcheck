const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Runs tasks with at most `perHost` running per host, starting no two tasks for
// one host closer together than `delay` ms. Different hosts do not wait for
// each other. `sleep` and `now` are injectable for tests.
export class HostLimiter {
  constructor({ perHost = 2, delay = 0, sleep = defaultSleep, now = Date.now } = {}) {
    this.perHost = perHost;
    this.delay = delay;
    this.sleep = sleep;
    this.now = now;
    this.hosts = new Map();
  }

  run(host, task) {
    return new Promise((resolve, reject) => {
      this.state(host).queue.push({ task, resolve, reject });
      this.pump(host);
    });
  }

  state(host) {
    if (!this.hosts.has(host)) this.hosts.set(host, { active: 0, queue: [], nextStart: 0 });
    return this.hosts.get(host);
  }

  pump(host) {
    const state = this.state(host);
    while (state.active < this.perHost && state.queue.length > 0) {
      const job = state.queue.shift();
      state.active++;
      const now = this.now();
      const startAt = Math.max(now, state.nextStart);
      state.nextStart = startAt + this.delay;
      Promise.resolve(startAt > now ? this.sleep(startAt - now) : undefined)
        .then(() => job.task())
        .then(job.resolve, job.reject)
        .finally(() => {
          state.active--;
          this.pump(host);
        });
    }
  }
}
