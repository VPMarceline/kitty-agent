import { useEffect, useRef } from "react";
import * as THREE from "three";

function createBox(group, geometry, material, size, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function mixColor(color, target, amount) {
  return new THREE.Color(color).lerp(new THREE.Color(target), amount);
}

function CatAvatar3D({ color, mood }) {
  const hostRef = useRef(null);
  const moodRef = useRef(mood);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      host.classList.add("webgl-fallback");
      host.textContent = "🐈 当前设备无法显示 3D";
      return () => {
        host.classList.remove("webgl-fallback");
        host.textContent = "";
      };
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-3.6, 3.6, 3.6, -3.6, 0.1, 100);
    camera.position.set(5.4, 4.4, 8.5);
    camera.lookAt(0, 1.35, 0);

    scene.add(new THREE.HemisphereLight(0xfffbf2, 0x43385f, 2.45));
    const keyLight = new THREE.DirectionalLight(0xfff7e6, 4.4);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 7;
    keyLight.shadow.camera.bottom = -3;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x9b8cff, 2.2);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

    const material = (value, extra = {}) =>
      new THREE.MeshStandardMaterial({
        color: value,
        roughness: 0.82,
        metalness: 0,
        flatShading: true,
        ...extra,
      });

    const coat = new THREE.Color(color);
    const fur = material(coat);
    const furLight = material(mixColor(coat, "#fff5e8", 0.6));
    const furDark = material(mixColor(coat, "#261f35", 0.34));
    const furShadow = material(mixColor(coat, "#352e48", 0.18));
    const earPink = material("#e99aa2");
    const eyeGreen = material("#8dd979", {
      emissive: new THREE.Color("#2b6d36"),
      emissiveIntensity: 0.22,
    });
    const eyeDark = material("#17131e");
    const eyeShine = material("#ffffff", {
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0.6,
    });
    const nosePink = material("#d87986");
    const mouthDark = material("#4a2633");
    const accent = material("#a78bfa", {
      emissive: new THREE.Color("#6d4bd1"),
      emissiveIntensity: 0.38,
    });
    const platformTop = material("#e8e1ff", { roughness: 1 });
    const platformSide = material("#b8a9ec", { roughness: 1 });
    const cube = new THREE.BoxGeometry(1, 1, 1);

    const cat = new THREE.Group();
    cat.rotation.y = -0.12;
    cat.position.y = -0.22;
    scene.add(cat);

    const bodyGroup = new THREE.Group();
    cat.add(bodyGroup);
    const body = createBox(bodyGroup, cube, fur, [1.45, 1.46, 1.12], [0, 0.54, 0]);
    createBox(bodyGroup, cube, furShadow, [1.2, 0.42, 1.02], [0, -0.31, -0.02]);
    createBox(bodyGroup, cube, furLight, [0.72, 0.92, 0.08], [0, 0.43, 0.61]);
    createBox(bodyGroup, cube, furLight, [0.48, 0.3, 0.1], [0, -0.18, 0.64]);

    [-0.65, 0.65].forEach((x) => {
      createBox(cat, cube, furShadow, [0.55, 0.63, 0.82], [x, -0.23, -0.14]);
    });
    [-0.48, 0.48].forEach((x) => {
      createBox(cat, cube, fur, [0.39, 0.95, 0.42], [x, -0.28, 0.49]);
      createBox(cat, cube, furLight, [0.48, 0.25, 0.64], [x, -0.78, 0.58]);
      createBox(cat, cube, nosePink, [0.07, 0.04, 0.03], [x - 0.09, -0.79, 0.91]);
      createBox(cat, cube, nosePink, [0.07, 0.04, 0.03], [x + 0.09, -0.79, 0.91]);
    });

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.63, 0.12);
    cat.add(headGroup);
    createBox(headGroup, cube, fur, [1.82, 1.42, 1.38], [0, 0, 0]);
    createBox(headGroup, cube, furShadow, [1.56, 0.2, 1.16], [0, 0.65, -0.04]);

    const ears = [];
    [-1, 1].forEach((side) => {
      const ear = new THREE.Group();
      ear.position.set(side * 0.59, 0.72, -0.03);
      headGroup.add(ear);
      createBox(ear, cube, fur, [0.61, 0.38, 0.65], [0, 0.12, 0]);
      createBox(ear, cube, fur, [0.42, 0.34, 0.52], [side * 0.05, 0.43, -0.02]);
      createBox(ear, cube, fur, [0.24, 0.28, 0.38], [side * 0.1, 0.69, -0.04]);
      createBox(ear, cube, earPink, [0.27, 0.33, 0.04], [side * 0.02, 0.29, 0.35]);
      ears.push(ear);
    });

    createBox(headGroup, cube, furDark, [0.18, 0.35, 0.05], [0, 0.54, 0.72]);
    createBox(headGroup, cube, furDark, [0.17, 0.27, 0.05], [-0.3, 0.58, 0.71], [0, 0, -0.12]);
    createBox(headGroup, cube, furDark, [0.17, 0.27, 0.05], [0.3, 0.58, 0.71], [0, 0, 0.12]);

    const eyeParts = [];
    [-0.46, 0.46].forEach((x) => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(x, 0.13, 0.72);
      headGroup.add(eyeGroup);
      createBox(eyeGroup, cube, eyeDark, [0.43, 0.37, 0.08], [0, 0, 0]);
      const iris = createBox(eyeGroup, cube, eyeGreen, [0.29, 0.29, 0.06], [0, -0.01, 0.07]);
      const pupil = createBox(eyeGroup, cube, eyeDark, [0.09, 0.27, 0.04], [0, -0.01, 0.13]);
      createBox(eyeGroup, cube, eyeShine, [0.075, 0.075, 0.035], [-0.07, 0.08, 0.17]);
      eyeParts.push({ group: eyeGroup, iris, pupil });
    });

    createBox(headGroup, cube, furLight, [0.57, 0.34, 0.18], [-0.27, -0.28, 0.72]);
    createBox(headGroup, cube, furLight, [0.57, 0.34, 0.18], [0.27, -0.28, 0.72]);
    createBox(headGroup, cube, nosePink, [0.23, 0.16, 0.13], [0, -0.2, 0.91]);
    createBox(headGroup, cube, mouthDark, [0.07, 0.14, 0.05], [0, -0.34, 0.88]);
    const mouth = createBox(headGroup, cube, mouthDark, [0.27, 0.06, 0.05], [0, -0.43, 0.88]);
    createBox(headGroup, cube, furLight, [0.48, 0.18, 0.13], [0, -0.55, 0.72]);

    [-1, 1].forEach((side) => {
      [-0.08, 0.08].forEach((offset, index) => {
        createBox(
          headGroup,
          cube,
          furLight,
          [0.55, 0.025, 0.025],
          [side * 0.72, -0.29 + offset, 0.83],
          [0, 0, side * (index === 0 ? -0.08 : 0.08)]
        );
      });
    });

    [-0.37, 0.03, 0.43].forEach((y, index) => {
      createBox(bodyGroup, cube, furDark, [0.08, 0.22, 0.58 - index * 0.07], [-0.76, y + 0.65, -0.08]);
      createBox(bodyGroup, cube, furDark, [0.08, 0.22, 0.58 - index * 0.07], [0.76, y + 0.65, -0.08]);
    });

    const tailRoot = new THREE.Group();
    tailRoot.position.set(0.88, 0.2, -0.42);
    cat.add(tailRoot);
    const tailSegments = [];
    [
      [0.18, 0.02, 0],
      [0.47, 0.18, 0],
      [0.67, 0.47, 0],
      [0.7, 0.8, 0],
      [0.58, 1.1, 0],
      [0.36, 1.31, 0],
    ].forEach((position, index) => {
      tailSegments.push(
        createBox(tailRoot, cube, index % 3 === 2 ? furDark : fur, [0.38, 0.38, 0.42], position)
      );
    });

    const thoughtPixels = new THREE.Group();
    thoughtPixels.position.set(1.18, 2.85, 0.1);
    cat.add(thoughtPixels);
    const thoughtBlocks = [
      createBox(thoughtPixels, cube, accent, [0.18, 0.18, 0.18], [0, 0, 0]),
      createBox(thoughtPixels, cube, accent, [0.25, 0.25, 0.25], [0.25, 0.31, 0]),
      createBox(thoughtPixels, cube, accent, [0.34, 0.34, 0.34], [0.57, 0.69, 0]),
    ];
    thoughtBlocks.forEach((block) => {
      block.userData.baseY = block.position.y;
    });
    thoughtPixels.visible = false;

    const platform = new THREE.Group();
    platform.position.y = -1.09;
    scene.add(platform);
    const platformBase = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.2, 8), platformSide);
    platformBase.receiveShadow = true;
    platform.add(platformBase);
    const platformSurface = new THREE.Mesh(new THREE.CylinderGeometry(2.18, 2.18, 0.12, 8), platformTop);
    platformSurface.position.y = 0.14;
    platformSurface.receiveShadow = true;
    platform.add(platformSurface);

    let targetRotation = -0.12;
    let dragging = false;
    let previousX = 0;
    const canvas = renderer.domElement;
    const onPointerDown = (event) => {
      dragging = true;
      previousX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging) return;
      targetRotation += (event.clientX - previousX) * 0.012;
      previousX = event.clientX;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const aspect = width / height;
      const viewHeight = 6.2;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const clock = new THREE.Clock();
    let frameId;
    const animate = () => {
      const time = clock.getElapsedTime();
      const currentMood = moodRef.current;
      const thinking = currentMood === "thinking";
      const speaking = currentMood === "speaking";

      cat.position.y = -0.22 + Math.sin(time * 1.8) * 0.035;
      cat.rotation.y += (targetRotation - cat.rotation.y) * 0.08;
      body.scale.y = 1.46 + Math.sin(time * 1.8) * 0.014;
      headGroup.rotation.z = thinking
        ? 0.08 + Math.sin(time * 1.6) * 0.025
        : Math.sin(time * 0.8) * 0.012;
      headGroup.rotation.y = speaking ? Math.sin(time * 4.2) * 0.045 : 0;
      mouth.scale.y = speaking ? 0.14 + Math.sin(time * 10) * 0.025 : 0.06;

      const blink = time % 4.6 > 4.38 ? 0.12 : 1;
      eyeParts.forEach(({ group }) => {
        group.scale.y += (blink - group.scale.y) * 0.58;
      });
      ears.forEach((ear, index) => {
        const twitch = thinking ? Math.sin(time * 3.3 + index) * 0.045 : 0;
        ear.rotation.z += (twitch * (index === 0 ? -1 : 1) - ear.rotation.z) * 0.15;
      });
      tailRoot.rotation.z = -0.15 + Math.sin(time * (thinking ? 3.1 : 1.8)) * 0.12;
      tailSegments.forEach((segment, index) => {
        segment.rotation.z = Math.sin(time * 2.1 - index * 0.38) * (0.04 + index * 0.012);
      });

      thoughtPixels.visible = thinking;
      if (thinking) {
        thoughtPixels.rotation.y = time * 0.8;
        thoughtBlocks.forEach((block, index) => {
          block.position.y = block.userData.baseY + Math.sin(time * 2.8 + index * 0.9) * 0.045;
        });
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      const geometries = new Set();
      const materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (Array.isArray(object.material)) object.material.forEach((item) => materials.add(item));
        else if (object.material) materials.add(object.material);
      });
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [color]);

  return <div className="cat-canvas voxel-cat" ref={hostRef} aria-label="动态3D像素小猫" />;
}

export default CatAvatar3D;
