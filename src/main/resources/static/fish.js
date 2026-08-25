(() => {
  'use strict';

  class SurfacePoint {
    constructor(renderer, x) {
      this.renderer = renderer;
      this.x = x;
      this.initHeight = renderer.height * renderer.INIT_HEIGHT_RATE;
      this.height = this.initHeight;
      this.fy = 0;
      this.force = { previous: 0, next: 0 };
    }

    interfere(y, velocity) {
      const direction = this.renderer.height - this.height - y >= 0 ? -1 : 1;
      this.fy = this.renderer.height * 0.01 * direction * Math.abs(velocity);
    }

    updateSelf() {
      this.fy += 0.03 * (this.initHeight - this.height);
      this.fy *= 0.9;
      this.height += this.fy;
    }

    updateNeighbors() {
      if (this.previous) this.force.previous = 0.3 * (this.height - this.previous.height);
      if (this.next) this.force.next = 0.3 * (this.height - this.next.height);
    }

    render(context) {
      if (this.previous) {
        this.previous.height += this.force.previous;
        this.previous.fy += this.force.previous;
      }
      if (this.next) {
        this.next.height += this.force.next;
        this.next.fy += this.force.next;
      }
      context.lineTo(this.x, this.renderer.height - this.height);
    }
  }

  class Fish {
    constructor(renderer) {
      this.renderer = renderer;
      this.init();
    }

    random(min, max) { return min + (max - min) * Math.random(); }

    init() {
      this.direction = Math.random() < 0.5;
      this.x = this.direction ? this.renderer.width + this.renderer.THRESHOLD : -this.renderer.THRESHOLD;
      this.vx = this.random(4, 10) * (this.direction ? -1 : 1);
      if (this.renderer.reverse) {
        this.y = this.random(this.renderer.height * 0.1, this.renderer.height * 0.4);
        this.vy = this.random(2, 5);
        this.ay = this.random(0.05, 0.2);
      } else {
        this.y = this.random(this.renderer.height * 0.6, this.renderer.height * 0.9);
        this.vy = this.random(-5, -2);
        this.ay = this.random(-0.2, -0.05);
      }
      this.previousY = this.y;
      this.isOut = false;
      this.theta = 0;
      this.phi = 0;
    }

    reverseVertical() {
      this.isOut = !this.isOut;
      this.ay *= -1;
    }

    controlStatus() {
      this.previousY = this.y;
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.ay;
      if (this.renderer.reverse) {
        if (this.y > this.renderer.height * this.renderer.INIT_HEIGHT_RATE) {
          this.vy -= 0.4;
          this.isOut = true;
        } else {
          if (this.isOut) this.ay = this.random(0.05, 0.2);
          this.isOut = false;
        }
      } else if (this.y < this.renderer.height * this.renderer.INIT_HEIGHT_RATE) {
        this.vy += 0.4;
        this.isOut = true;
      } else {
        if (this.isOut) this.ay = this.random(-0.2, -0.05);
        this.isOut = false;
      }
      if (!this.isOut) {
        this.theta = (this.theta + Math.PI / 20) % (Math.PI * 2);
        this.phi = (this.phi + Math.PI / 30) % (Math.PI * 2);
      }
      this.renderer.generateEpicenter(
        this.x + (this.direction ? -1 : 1) * this.renderer.THRESHOLD,
        this.y,
        this.y - this.previousY
      );
      if ((this.vx > 0 && this.x > this.renderer.width + this.renderer.THRESHOLD)
        || (this.vx < 0 && this.x < -this.renderer.THRESHOLD)) this.init();
    }

    render(context) {
      context.save();
      context.translate(this.x, this.y);
      context.rotate(Math.PI + Math.atan2(this.vy, this.vx));
      context.scale(1, this.direction ? 1 : -1);
      context.beginPath();
      context.moveTo(-30, 0);
      context.bezierCurveTo(-20, 15, 15, 10, 40, 0);
      context.bezierCurveTo(15, -10, -20, -15, -30, 0);
      context.fill();

      context.save();
      context.translate(40, 0);
      context.scale(0.9 + 0.2 * Math.sin(this.theta), 1);
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(5, 10, 20, 8);
      context.quadraticCurveTo(12, 5, 10, 0);
      context.quadraticCurveTo(12, -5, 20, -8);
      context.quadraticCurveTo(5, -10, 0, 0);
      context.fill();
      context.restore();

      context.save();
      context.translate(-3, 0);
      context.rotate((Math.PI / 3 + Math.PI / 10 * Math.sin(this.phi)) * (this.renderer.reverse ? -1 : 1));
      context.beginPath();
      if (this.renderer.reverse) {
        context.moveTo(5, 0);
        context.bezierCurveTo(10, 10, 10, 30, 0, 40);
        context.bezierCurveTo(-12, 25, -8, 10, 0, 0);
      } else {
        context.moveTo(-5, 0);
        context.bezierCurveTo(-10, -10, -10, -30, 0, -40);
        context.bezierCurveTo(12, -25, 8, -10, 0, 0);
      }
      context.closePath();
      context.fill();
      context.restore();
      context.restore();
      this.controlStatus();
    }
  }

  class FishRenderer {
    constructor(container) {
      this.POINT_INTERVAL = 5;
      this.FISH_COUNT = 3;
      this.MAX_INTERVAL_COUNT = 50;
      this.INIT_HEIGHT_RATE = 0.5;
      this.THRESHOLD = 50;
      this.container = container;
      this.canvas = document.createElement('canvas');
      this.context = this.canvas.getContext('2d');
      this.container.append(this.canvas);
      this.points = [];
      this.fishes = [];
      this.reverse = false;
      this.axis = null;
      this.visible = true;
      this.resizeTimer = 0;
      this.refreshColor();
      this.setup();
      this.bind();
      this.render = this.render.bind(this);
      requestAnimationFrame(this.render);
    }

    refreshColor() {
      const styles = getComputedStyle(document.documentElement);
      this.color = styles.getPropertyValue('--pink-deep').trim() || '#bf4674';
    }

    setup() {
      this.width = Math.max(10, this.container.clientWidth);
      this.height = Math.max(80, this.container.clientHeight);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.width * ratio);
      this.canvas.height = Math.round(this.height * ratio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.points = [];
      this.fishes = [new Fish(this)];
      this.intervalCount = this.MAX_INTERVAL_COUNT;
      this.fishCount = Math.max(1, this.FISH_COUNT * this.width / 500 * this.height / 500);
      const count = Math.max(3, Math.round(this.width / this.POINT_INTERVAL));
      this.pointInterval = this.width / (count - 1);
      for (let index = 0; index < count; index += 1) {
        const point = new SurfacePoint(this, index * this.pointInterval);
        const previous = this.points[index - 1];
        if (previous) {
          point.previous = previous;
          previous.next = point;
        }
        this.points.push(point);
      }
    }

    bind() {
      window.addEventListener('resize', () => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => this.setup(), 180);
      }, { passive: true });
      window.addEventListener('showcase-theme-change', () => this.refreshColor());
      this.container.addEventListener('mouseenter', (event) => { this.axis = this.getAxis(event); });
      this.container.addEventListener('mousemove', (event) => {
        const axis = this.getAxis(event);
        if (!this.axis) this.axis = axis;
        this.generateEpicenter(axis.x, axis.y, axis.y - this.axis.y);
        this.axis = axis;
      });
      this.container.addEventListener('mouseleave', () => { this.axis = null; });
      this.container.addEventListener('click', () => {
        this.reverse = !this.reverse;
        this.fishes.forEach((fish) => fish.reverseVertical());
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; }, { rootMargin: '100px' })
          .observe(this.container);
      }
    }

    getAxis(event) {
      const bounds = this.container.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    generateEpicenter(x, y, velocity) {
      if (y < this.height / 2 - this.THRESHOLD || y > this.height / 2 + this.THRESHOLD) return;
      const index = Math.round(x / this.pointInterval);
      if (index >= 0 && index < this.points.length) this.points[index].interfere(y, velocity);
    }

    controlStatus() {
      this.points.forEach((point) => point.updateSelf());
      this.points.forEach((point) => point.updateNeighbors());
      if (this.fishes.length < this.fishCount && --this.intervalCount === 0) {
        this.intervalCount = this.MAX_INTERVAL_COUNT;
        this.fishes.push(new Fish(this));
      }
    }

    render() {
      requestAnimationFrame(this.render);
      if (!this.visible) return;
      this.controlStatus();
      this.context.clearRect(0, 0, this.width, this.height);
      this.context.fillStyle = this.color;
      this.fishes.forEach((fish) => fish.render(this.context));
      this.context.save();
      this.context.globalAlpha = document.documentElement.dataset.showcaseMode === 'dark' ? 0.34 : 0.22;
      this.context.globalCompositeOperation = 'xor';
      this.context.beginPath();
      this.context.moveTo(0, this.reverse ? 0 : this.height);
      this.points.forEach((point) => point.render(this.context));
      this.context.lineTo(this.width, this.reverse ? 0 : this.height);
      this.context.closePath();
      this.context.fill();
      this.context.restore();
    }
  }

  const container = document.querySelector('#jsi-flying-fish-container');
  if (container) new FishRenderer(container);
})();
