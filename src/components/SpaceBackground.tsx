"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  layer: number; // 0 = distant, 1 = mid, 2 = near
  color: string;
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

interface DistantSatellite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  blinkPhase: number;
  blinkSpeed: number;
  active: boolean;
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

// Procedurally generate a detailed, realistic offscreen Moon canvas
function createOffscreenMoon(radius: number): HTMLCanvasElement {
  const size = Math.ceil(radius * 4); // Extra margin for soft lunar corona / glow
  const mCanvas = document.createElement("canvas");
  mCanvas.width = size;
  mCanvas.height = size;
  const mCtx = mCanvas.getContext("2d");
  if (!mCtx) return mCanvas;

  const cx = size / 2;
  const cy = size / 2;

  // 1. Soft lunar corona / celestial glow
  const glow = mCtx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.85);
  glow.addColorStop(0, "rgba(235, 220, 205, 0.18)");
  glow.addColorStop(0.5, "rgba(204, 120, 92, 0.06)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  mCtx.fillStyle = glow;
  mCtx.beginPath();
  mCtx.arc(cx, cy, radius * 1.85, 0, Math.PI * 2);
  mCtx.fill();

  // 2. Clip to moon disc for surface details
  mCtx.save();
  mCtx.beginPath();
  mCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  mCtx.clip();

  // 3. Base spherical body gradient (simulating sunlight from upper-left)
  const sunX = cx - radius * 0.45;
  const sunY = cy - radius * 0.45;
  const baseGrad = mCtx.createRadialGradient(sunX, sunY, radius * 0.1, cx, cy, radius * 1.15);
  baseGrad.addColorStop(0, "#f3f5fa"); // Sunlit highlight
  baseGrad.addColorStop(0.45, "#d2d7e4"); // Midtone regolith
  baseGrad.addColorStop(0.75, "#8e95a5"); // Penumbra
  baseGrad.addColorStop(1, "#363a48"); // Shadowed limb
  mCtx.fillStyle = baseGrad;
  mCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // 4. Lunar Maria (dark basaltic volcanic plains)
  const mariaData = [
    { x: -0.22, y: -0.2, rx: 0.32, ry: 0.28, rot: 0.2 }, // Mare Imbrium
    { x: -0.4, y: 0.05, rx: 0.3, ry: 0.4, rot: -0.3 }, // Oceanus Procellarum
    { x: 0.25, y: -0.25, rx: 0.22, ry: 0.2, rot: 0.1 }, // Mare Serenitatis
    { x: 0.32, y: 0.02, rx: 0.24, ry: 0.22, rot: -0.1 }, // Mare Tranquillitatis
    { x: 0.52, y: -0.15, rx: 0.16, ry: 0.14, rot: 0.2 }, // Mare Crisium
    { x: 0.15, y: 0.28, rx: 0.28, ry: 0.18, rot: 0.15 }, // Mare Fecunditatis
  ];

  mCtx.fillStyle = "rgba(65, 70, 85, 0.38)";
  mariaData.forEach((m) => {
    mCtx.save();
    mCtx.translate(cx + m.x * radius, cy + m.y * radius);
    mCtx.rotate(m.rot);
    mCtx.beginPath();
    mCtx.ellipse(0, 0, m.rx * radius, m.ry * radius, 0, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
  });

  // Secondary soft patches
  mCtx.fillStyle = "rgba(45, 50, 65, 0.22)";
  [
    { x: -0.1, y: 0.18, r: radius * 0.18 },
    { x: 0.05, y: -0.05, r: radius * 0.14 },
    { x: 0.38, y: 0.22, r: radius * 0.12 },
  ].forEach((p) => {
    mCtx.beginPath();
    mCtx.arc(cx + p.x, cy + p.y, p.r, 0, Math.PI * 2);
    mCtx.fill();
  });

  // 5. Prominent impact craters (Tycho, Copernicus, Kepler, Aristarchus)
  const craters = [
    { x: 0.05, y: 0.52, r: radius * 0.07, ray: true }, // Tycho with ray system
    { x: -0.18, y: -0.08, r: radius * 0.065, ray: true }, // Copernicus
    { x: -0.38, y: -0.04, r: radius * 0.045, ray: false }, // Kepler
    { x: -0.44, y: -0.22, r: radius * 0.038, ray: false }, // Aristarchus
    { x: 0.28, y: 0.44, r: radius * 0.05, ray: false },
  ];

  craters.forEach((c) => {
    const px = cx + c.x * radius;
    const py = cy + c.y * radius;

    // Ray system (faint bright ejecta streaks)
    if (c.ray) {
      mCtx.strokeStyle = "rgba(245, 248, 255, 0.18)";
      mCtx.lineWidth = 1;
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3 + 0.2;
        mCtx.beginPath();
        mCtx.moveTo(px, py);
        mCtx.lineTo(px + Math.cos(ang) * radius * 0.35, py + Math.sin(ang) * radius * 0.35);
        mCtx.stroke();
      }
    }

    // Crater depression shadow
    mCtx.fillStyle = "rgba(25, 28, 38, 0.55)";
    mCtx.beginPath();
    mCtx.arc(px, py, c.r, 0, Math.PI * 2);
    mCtx.fill();

    // Illuminated crater rim
    mCtx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    mCtx.lineWidth = Math.max(1, radius * 0.02);
    mCtx.beginPath();
    mCtx.arc(px, py, c.r, Math.PI * 0.75, Math.PI * 1.75);
    mCtx.stroke();
  });

  // 6. 3D Waxing Gibbous Terminator Shadow
  const shadowGrad = mCtx.createRadialGradient(
    cx + radius * 0.65,
    cy + radius * 0.65,
    radius * 0.2,
    cx + radius * 0.3,
    cy + radius * 0.3,
    radius * 1.15
  );
  shadowGrad.addColorStop(0, "rgba(10, 12, 18, 0.88)"); // Dark side
  shadowGrad.addColorStop(0.55, "rgba(20, 24, 34, 0.5)"); // Terminator gradient
  shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)"); // Illuminated face
  mCtx.fillStyle = shadowGrad;
  mCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Subtle illuminated limb highlight
  const limbGrad = mCtx.createRadialGradient(sunX, sunY, radius * 0.9, sunX, sunY, radius * 1.02);
  limbGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  limbGrad.addColorStop(0.8, "rgba(240, 248, 255, 0.35)");
  limbGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  mCtx.fillStyle = limbGrad;
  mCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

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
    let nextShootingStarTime = performance.now() + 1500; // First shooting star soon after load

    // Distant satellite / space station beacon
    let satellite: DistantSatellite = {
      x: -50,
      y: 100,
      vx: 0.35,
      vy: 0.08,
      size: 1.5,
      blinkPhase: 0,
      blinkSpeed: 0.05,
      active: true,
    };
    let nextSatelliteSpawn = performance.now() + 8000;

    // Orbiting Moon
    const moonRadius = 46;
    let offscreenMoon: HTMLCanvasElement | null = null;
    let moon: MoonState = {
      active: false,
      x: -moonRadius * 2,
      y: 120,
      radius: moonRadius,
      vx: 0.36,
      vy: 0.12,
      alpha: 0,
      nextAppearanceTime: performance.now() + 6000, // Starts first pass in ~6 seconds
    };

    // Orbital movement settings
    // Simulates looking out from an orbiting satellite moving through space
    // Stars and celestial bodies drift along an orbital tangent vector (~18-20 degree tilt)
    const orbitalAngle = (18 * Math.PI) / 180;
    const baseOrbitalSpeed = 0.22; // pixels per frame at 60fps
    const dirX = Math.cos(orbitalAngle);
    const dirY = Math.sin(orbitalAngle);

    // Color palettes for stars
    const starColors = [
      "rgba(255, 255, 255,", // Pure white
      "rgba(240, 242, 246,", // Soft starlight
      "rgba(255, 238, 224,", // Warm amber
      "rgba(245, 225, 210,", // Claude terracotta glow
      "rgba(255, 245, 235,", // Warm diamond
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
      offscreenMoon = createOffscreenMoon(moonRadius);
      initStars();
    }

    function initStars() {
      // Density based on viewport area
      const area = width * height;
      const count = Math.max(220, Math.floor(area / 3600));

      stars = [];
      for (let i = 0; i < count; i++) {
        // Distribute layers: 60% distant, 28% mid, 12% near
        const rand = Math.random();
        let layer = 0;
        let size = 0.7 + Math.random() * 0.7;
        let baseAlpha = 0.35 + Math.random() * 0.35;

        if (rand > 0.88) {
          layer = 2; // Near stars
          size = 1.7 + Math.random() * 1.3;
          baseAlpha = 0.7 + Math.random() * 0.28;
        } else if (rand > 0.6) {
          layer = 1; // Mid stars
          size = 1.1 + Math.random() * 0.7;
          baseAlpha = 0.5 + Math.random() * 0.35;
        }

        const colorBase = starColors[Math.floor(Math.random() * starColors.length)];

        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size,
          baseAlpha,
          twinkleSpeed: 0.015 + Math.random() * 0.035,
          twinklePhase: Math.random() * Math.PI * 2,
          layer,
          color: colorBase,
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

      const isWarm = Math.random() > 0.5;
      const headColor = isWarm ? "#fff5ea" : "#ffffff";
      const trailColor = isWarm ? "204, 120, 92" : "240, 225, 215";

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

      // Deep space atmospheric base
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#05060a");
      bgGrad.addColorStop(0.5, "#070913");
      bgGrad.addColorStop(1, "#030408");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle cosmic nebulae (soft drifting interstellar clouds)
      const nebula1X = width * 0.75 + Math.cos(currentTime * 0.0001) * 30;
      const nebula1Y = height * 0.25 + Math.sin(currentTime * 0.0001) * 20;
      const neb1 = ctx.createRadialGradient(nebula1X, nebula1Y, 10, nebula1X, nebula1Y, width * 0.55);
      neb1.addColorStop(0, "rgba(90, 52, 40, 0.06)");
      neb1.addColorStop(0.5, "rgba(65, 38, 30, 0.03)");
      neb1.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, width, height);

      const nebula2X = width * 0.2 + Math.sin(currentTime * 0.00008) * 40;
      const nebula2Y = height * 0.8 + Math.cos(currentTime * 0.00008) * 25;
      const neb2 = ctx.createRadialGradient(nebula2X, nebula2Y, 10, nebula2X, nebula2Y, width * 0.5);
      neb2.addColorStop(0, "rgba(80, 45, 35, 0.05)");
      neb2.addColorStop(0.6, "rgba(55, 32, 25, 0.02)");
      neb2.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, width, height);

      // 3. Render distant background stars (Layer 0)
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (star.layer !== 0) continue;

        const moveDist = baseOrbitalSpeed * 0.6 * deltaFactor;
        star.x += dirX * moveDist;
        star.y += dirY * moveDist;

        const margin = 20;
        if (star.x > width + margin) star.x = -margin;
        else if (star.x < -margin) star.x = width + margin;
        if (star.y > height + margin) star.y = -margin;
        else if (star.y < -margin) star.y = height + margin;

        star.twinklePhase += star.twinkleSpeed * deltaFactor;
        const twinkle = (Math.sin(star.twinklePhase) + 1) * 0.5;
        const currentAlpha = Math.max(0.18, Math.min(1, star.baseAlpha * (0.68 + twinkle * 0.4)));

        ctx.fillStyle = `${star.color}${currentAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Orbiting Moon
      if (moon.active && offscreenMoon) {
        moon.x += moon.vx * deltaFactor;
        moon.y += moon.vy * deltaFactor;

        // Smooth fade-in on entrance and fade-out on exit
        if (moon.x < 140) {
          moon.alpha = Math.min(0.85, moon.alpha + 0.008 * deltaFactor);
        } else if (moon.x > width - 140) {
          moon.alpha = Math.max(0, moon.alpha - 0.008 * deltaFactor);
        } else {
          moon.alpha = 0.85;
        }

        ctx.save();
        ctx.globalAlpha = moon.alpha;
        const drawSize = moon.radius * 4;
        ctx.drawImage(offscreenMoon, moon.x - drawSize / 2, moon.y - drawSize / 2, drawSize, drawSize);
        ctx.restore();

        // Check if Moon has crossed the screen
        if (moon.x > width + moon.radius * 2 || moon.y > height + moon.radius * 2) {
          moon.active = false;
          // Next orbital pass in ~70 to 110 seconds
          moon.nextAppearanceTime = currentTime + 70000 + Math.random() * 40000;
        }
      } else if (currentTime > moon.nextAppearanceTime && !moon.active) {
        // Spawn Moon along the orbital plane
        moon.active = true;
        moon.x = -moon.radius * 2;
        moon.y = Math.random() * (height * 0.35) + 40;
        moon.vx = 0.32 + Math.random() * 0.12; // slow majestic orbital drift
        moon.vy = 0.09 + Math.random() * 0.06;
        moon.alpha = 0;
      }

      // 5. Render Mid & Near stars (Layers 1 & 2)
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (star.layer === 0) continue;

        const layerMultiplier = star.layer === 1 ? 1.0 : 1.7;
        const moveDist = baseOrbitalSpeed * layerMultiplier * deltaFactor;

        star.x += dirX * moveDist;
        star.y += dirY * moveDist;

        const margin = 20;
        if (star.x > width + margin) star.x = -margin;
        else if (star.x < -margin) star.x = width + margin;
        if (star.y > height + margin) star.y = -margin;
        else if (star.y < -margin) star.y = height + margin;

        star.twinklePhase += star.twinkleSpeed * deltaFactor;
        const twinkle = (Math.sin(star.twinklePhase) + 1) * 0.5;
        const currentAlpha = Math.max(0.18, Math.min(1, star.baseAlpha * (0.68 + twinkle * 0.4)));

        ctx.fillStyle = `${star.color}${currentAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        if (star.layer === 2 && currentAlpha > 0.65) {
          ctx.fillStyle = `${star.color}${(currentAlpha * 0.2).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 6. Distant satellite orbiting with blinking beacon
      if (satellite.active) {
        satellite.x += satellite.vx * deltaFactor;
        satellite.y += satellite.vy * deltaFactor;
        satellite.blinkPhase += satellite.blinkSpeed * deltaFactor;

        ctx.fillStyle = "rgba(220, 235, 255, 0.75)";
        ctx.beginPath();
        ctx.arc(satellite.x, satellite.y, satellite.size, 0, Math.PI * 2);
        ctx.fill();

        const beaconIntensity = Math.pow(Math.sin(satellite.blinkPhase), 6);
        if (beaconIntensity > 0.4) {
          ctx.fillStyle = `rgba(204, 120, 92, ${(beaconIntensity * 0.9).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(satellite.x, satellite.y, satellite.size * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (satellite.x > width + 50 || satellite.y > height + 50) {
          satellite.active = false;
          nextSatelliteSpawn = currentTime + 22000 + Math.random() * 25000;
        }
      } else if (currentTime > nextSatelliteSpawn) {
        satellite = {
          x: -30,
          y: Math.random() * (height * 0.6) + 30,
          vx: 0.3 + Math.random() * 0.2,
          vy: 0.05 + Math.random() * 0.1,
          size: 1.2 + Math.random() * 0.6,
          blinkPhase: 0,
          blinkSpeed: 0.06 + Math.random() * 0.04,
          active: true,
        };
      }

      // 7. Periodic Shooting Stars / Falling Stars
      if (currentTime > nextShootingStarTime) {
        shootingStars.push(createShootingStar());
        nextShootingStarTime = currentTime + 3500 + Math.random() * 4000;
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
