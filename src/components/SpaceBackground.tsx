"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number; // visual radius in px (distant pinpoint starlight)
  baseAlpha: number; // apparent luminosity
  color: string; // stellar spectrum color
  isAnchor: boolean; // navigational anchor star
  speedMultiplier: number; // celestial orbital drift speed factor
}

interface ShootingStar {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  dx: number;
  dy: number;
  opacity: number;
  maxOpacity: number;
  fadeSpeed: number;
  size: number;
  trailColor: string;
  headColor: string;
  age: number;
  maxAge: number;
}


interface MoonState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  alpha: number;
  nextAppearanceTime: number;
}

// Render authentic, photorealistic Earth Moon with real craters and maria
function createOffscreenMoon(radius: number, moonImg: HTMLImageElement | null): HTMLCanvasElement {
  const pixelSize = Math.ceil(radius * 8); // High-DPI canvas for crisp craters and details
  const mCanvas = document.createElement("canvas");
  mCanvas.width = pixelSize;
  mCanvas.height = pixelSize;
  const mCtx = mCanvas.getContext("2d");
  if (!mCtx) return mCanvas;

  const cx = pixelSize / 2;
  const cy = pixelSize / 2;
  const r = radius * 2; // Lunar disc radius in offscreen canvas coordinates

  // 1. Soft lunar corona / celestial glow
  const glow = mCtx.createRadialGradient(cx, cy, r * 0.75, cx, cy, r * 1.6);
  glow.addColorStop(0, "rgba(225, 235, 250, 0.15)");
  glow.addColorStop(0.4, "rgba(59, 130, 246, 0.05)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  mCtx.fillStyle = glow;
  mCtx.beginPath();
  mCtx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
  mCtx.fill();

  // 2. Render authentic Earth Moon
  mCtx.save();
  mCtx.beginPath();
  mCtx.arc(cx, cy, r, 0, Math.PI * 2);
  mCtx.clip();

  if (moonImg && moonImg.complete && moonImg.naturalWidth > 0) {
    // Photorealistic Earth Moon with real craters (Tycho, Copernicus, Kepler, Aristarchus) and maria
    mCtx.imageSmoothingEnabled = true;
    mCtx.imageSmoothingQuality = "high";
    mCtx.drawImage(moonImg, cx - r, cy - r, r * 2, r * 2);

    // Subtle 3D spherical limb darkening for authentic globe depth
    const limbGrad = mCtx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r);
    limbGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    limbGrad.addColorStop(0.85, "rgba(0, 0, 0, 0.06)");
    limbGrad.addColorStop(1, "rgba(8, 12, 18, 0.32)");
    mCtx.fillStyle = limbGrad;
    mCtx.beginPath();
    mCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mCtx.fill();
  } else {
    // Elegant temporary fallback while image loads
    const sunX = cx - r * 0.45;
    const sunY = cy - r * 0.45;
    const baseGrad = mCtx.createRadialGradient(sunX, sunY, r * 0.1, cx, cy, r * 1.15);
    baseGrad.addColorStop(0, "#eceff4");
    baseGrad.addColorStop(0.5, "#cbd2dc");
    baseGrad.addColorStop(0.85, "#808796");
    baseGrad.addColorStop(1, "#2e323d");
    mCtx.fillStyle = baseGrad;
    mCtx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  mCtx.restore();

  return mCanvas;
}

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Stars collection
    let stars: Star[] = [];
    const shootingStars: ShootingStar[] = [];
    // Rare shooting stars / falling stars: once every 5 minutes
    const SHOOTING_STAR_INTERVAL_MS = 5 * 60 * 1000;
    let nextShootingStarTime = performance.now() + SHOOTING_STAR_INTERVAL_MS;

    // Orbiting Moon
    const moonRadius = 46;
    let offscreenMoon: HTMLCanvasElement | null = null;
    const moonImg = typeof window !== "undefined" ? new Image() : null;
    if (moonImg) {
      moonImg.src = "/moon.png";
      moonImg.onload = () => {
        offscreenMoon = createOffscreenMoon(moonRadius, moonImg);
      };
    }

    // Orbital movement settings
    // Stars sky and Moon drift together along the orbital trajectory (~18 degree angle)
    const orbitalAngle = (18 * Math.PI) / 180;
    const baseOrbitalSpeed = 0.12; // Smooth, visible celestial drift speed (2x slower)
    const dirX = Math.cos(orbitalAngle);
    const dirY = Math.sin(orbitalAngle);

    const moonBaseSpeed = 0.19; // 2x slower majestic celestial motion
    let moon: MoonState = {
      active: false,
      x: -(moonRadius * 2 + 20),
      y: 120,
      radius: moonRadius,
      vx: dirX * moonBaseSpeed,
      vy: dirY * moonBaseSpeed,
      alpha: 0.85,
      nextAppearanceTime: performance.now() + 5000, // Starts first pass in ~5 seconds
    };

    // Color palettes for stars: authentic stellar temperature classes
    const starColors = [
      "rgba(255, 255, 255,", // Pure white (Class A)
      "rgba(240, 244, 255,", // Diamond starlight (Class B/A)
      "rgba(215, 235, 255,", // Space blue starlight glow (Class B/O)
      "rgba(180, 215, 255,", // Deep space blue celestial glow (Class O)
      "rgba(235, 245, 255,", // Cool diamond starlight (Class A/B)
    ];

    function resize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx!.scale(dpr, dpr);
      offscreenMoon = createOffscreenMoon(moonRadius, moonImg && moonImg.complete ? moonImg : null);
      initStars();
    }

    function initStars() {
      // Natural sky density calibrated to viewport area
      const screenArea = width * height;
      const count = Math.max(220, Math.floor(screenArea / 3600));

      stars = [];
      for (let i = 0; i < count; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;

        const rand = Math.random();
        let size: number;
        let baseAlpha: number;
        let isAnchor = false;
        let speedMultiplier = 1.0;

        if (rand > 0.96) {
          // Prominent navigational anchor stars (~4%) - crisp, slightly brighter
          isAnchor = true;
          size = 1.3 + Math.random() * 0.4;
          baseAlpha = 0.8 + Math.random() * 0.2;
          speedMultiplier = 1.12;
        } else if (rand > 0.76) {
          // Medium stars (~20%)
          size = 0.9 + Math.random() * 0.35;
          baseAlpha = 0.5 + Math.random() * 0.25;
          speedMultiplier = 1.0;
        } else {
          // Distant background stars (~76%) - fine pinpoint starlight
          size = 0.5 + Math.random() * 0.35;
          baseAlpha = 0.25 + Math.random() * 0.25;
          speedMultiplier = 0.9;
        }

        const colorBase = starColors[Math.floor(Math.random() * starColors.length)];

        stars.push({
          x,
          y,
          size,
          baseAlpha,
          color: colorBase,
          isAnchor,
          speedMultiplier,
        });
      }
    }

    function createShootingStar(): ShootingStar {
      // Shooting stars travel rapidly at an angle
      const angle = (Math.PI / 180) * (32 + Math.random() * 26); // 32 to 58 degrees
      const speed = 14 + Math.random() * 10;
      const length = 110 + Math.random() * 130;

      // Spawn in top or top-left area
      const fromTop = Math.random() > 0.35;
      const x = fromTop ? Math.random() * width * 0.85 : -20;
      const y = fromTop ? Math.random() * (height * 0.4) : Math.random() * (height * 0.5);

      const isBlue = Math.random() > 0.5;
      const headColor = isBlue ? "#eef5ff" : "#ffffff";
      const trailColor = isBlue ? "59, 130, 246" : "195, 220, 255";

      return {
        x,
        y,
        length,
        speed,
        angle,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        opacity: 0,
        maxOpacity: 0.85 + Math.random() * 0.15,
        fadeSpeed: 0.018 + Math.random() * 0.016,
        size: 1.4 + Math.random() * 1.2,
        trailColor,
        headColor,
        age: 0,
        maxAge: 45 + Math.random() * 30, // frames alive
      };
    }

    let lastTime = performance.now();

    function render(currentTime: number) {
      const deltaMs = Math.min(currentTime - lastTime, 100);
      lastTime = currentTime;
      const deltaFactor = deltaMs / 16.667; // Normalize to 60fps

      if (!ctx) return;

      // 1. Clear background and paint deep space void
      ctx.clearRect(0, 0, width, height);

      // Deep space atmospheric base with cosmic space-blue depth
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#030712");
      bgGrad.addColorStop(0.5, "#061026");
      bgGrad.addColorStop(1, "#02050e");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Cosmic nebulae gently breathing in deep space
      const nebula1X = width * 0.75 + Math.cos(currentTime * 0.0001) * 50;
      const nebula1Y = height * 0.25 + Math.sin(currentTime * 0.0001) * 30;
      const neb1 = ctx.createRadialGradient(nebula1X, nebula1Y, 10, nebula1X, nebula1Y, width * 0.55);
      neb1.addColorStop(0, "rgba(35, 75, 160, 0.075)");
      neb1.addColorStop(0.5, "rgba(25, 55, 125, 0.035)");
      neb1.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, width, height);

      const nebula2X = width * 0.2 + Math.sin(currentTime * 0.00008) * 40;
      const nebula2Y = height * 0.8 + Math.cos(currentTime * 0.00008) * 25;
      const neb2 = ctx.createRadialGradient(nebula2X, nebula2Y, 10, nebula2X, nebula2Y, width * 0.5);
      neb2.addColorStop(0, "rgba(30, 65, 145, 0.065)");
      neb2.addColorStop(0.6, "rgba(20, 45, 110, 0.025)");
      neb2.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, width, height);

      // 3. Render stars sky moving along with moon
      const margin = 20;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Stars sky moves along with the moon along the orbital trajectory
        const moveDist = baseOrbitalSpeed * star.speedMultiplier * deltaFactor;
        star.x += dirX * moveDist;
        star.y += dirY * moveDist;

        // Wrap around smoothly across margins
        if (star.x > width + margin) {
          star.x = -margin;
        } else if (star.x < -margin) {
          star.x = width + margin;
        }
        if (star.y > height + margin) {
          star.y = -margin;
        } else if (star.y < -margin) {
          star.y = height + margin;
        }

        // Fast viewport boundary culling
        if (star.x < -margin || star.x > width + margin || star.y < -margin || star.y > height + margin) {
          continue;
        }

        // Steady, serene starlight without flickering or blinking
        const currentAlpha = star.baseAlpha;

        ctx.fillStyle = `${star.color}${currentAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Soft, steady starlight diffraction glow for prominent anchor stars
        if (star.isAnchor) {
          ctx.fillStyle = `${star.color}${(currentAlpha * 0.14).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Orbiting Moon
      if (moon.active && offscreenMoon) {
        moon.x += moon.vx * deltaFactor;
        moon.y += moon.vy * deltaFactor;

        ctx.save();
        ctx.globalAlpha = moon.alpha;
        const drawSize = moon.radius * 4;
        ctx.drawImage(offscreenMoon, moon.x - drawSize / 2, moon.y - drawSize / 2, drawSize, drawSize);
        ctx.restore();

        // Check if Moon has crossed completely past the screen boundary
        const exitOffset = moon.radius * 2 + 20;
        if (moon.x > width + exitOffset || moon.y > height + exitOffset) {
          moon.active = false;
          // Next orbital pass in ~70 to 110 seconds
          moon.nextAppearanceTime = currentTime + 70000 + Math.random() * 40000;
        }
      } else if (currentTime > moon.nextAppearanceTime && !moon.active) {
        // Spawn Moon along the orbital plane moving along with stars sky
        moon.active = true;
        moon.x = -(moon.radius * 2 + 20);
        moon.y = Math.random() * (height * 0.35) + 40;
        const moonSpeed = 0.17 + Math.random() * 0.04; // 2x slower traversal speed
        moon.vx = dirX * moonSpeed;
        moon.vy = dirY * moonSpeed;
        moon.alpha = 0.85;
      }

      // 5. Periodic Shooting Stars / Falling Stars (rare celestial event, once every ~5 minutes)
      if (currentTime > nextShootingStarTime) {
        shootingStars.push(createShootingStar());
        nextShootingStarTime = currentTime + SHOOTING_STAR_INTERVAL_MS + (Math.random() - 0.5) * 60000;
      }

      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        ss.age += deltaFactor;
        ss.x += ss.dx * deltaFactor;
        ss.y += ss.dy * deltaFactor;

        const lifeRatio = ss.age / ss.maxAge;
        if (lifeRatio < 0.25) {
          ss.opacity = (lifeRatio / 0.25) * ss.maxOpacity;
        } else {
          ss.opacity = (1 - (lifeRatio - 0.25) / 0.75) * ss.maxOpacity;
        }

        if (lifeRatio >= 1 || ss.opacity <= 0.01 || ss.x > width + 100 || ss.y > height + 100) {
          shootingStars.splice(i, 1);
          continue;
        }

        const tailX = ss.x - Math.cos(ss.angle) * ss.length;
        const tailY = ss.y - Math.sin(ss.angle) * ss.length;

        const gradient = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        gradient.addColorStop(0, `rgba(${ss.trailColor}, 0)`);
        gradient.addColorStop(0.65, `rgba(${ss.trailColor}, ${(ss.opacity * 0.35).toFixed(3)})`);
        gradient.addColorStop(0.92, `rgba(${ss.trailColor}, ${(ss.opacity * 0.85).toFixed(3)})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, ${(ss.opacity).toFixed(3)})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = ss.size;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(ss.x, ss.y);
        ctx.stroke();

        ctx.fillStyle = ss.headColor;
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, ss.size * 1.3, 0, Math.PI * 2);
        ctx.fill();

        const flare = ctx.createRadialGradient(ss.x, ss.y, 0, ss.x, ss.y, ss.size * 4);
        flare.addColorStop(0, `rgba(255, 255, 255, ${(ss.opacity * 0.9).toFixed(2)})`);
        flare.addColorStop(0.4, `rgba(${ss.trailColor}, ${(ss.opacity * 0.4).toFixed(2)})`);
        flare.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = flare;
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, ss.size * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(animationFrameId);
      } else {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(render);
      }
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    resize();
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="space-star-background"
      aria-hidden="true"
    />
  );
}
