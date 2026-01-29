import { useCursor, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useAtom } from "jotai";
import { easing } from "maath";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bone,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Uint16BufferAttribute,
  Vector3,
  CanvasTexture,
} from "three";
import { degToRad } from "three/src/math/MathUtils.js";
import { pageAtom, pages } from "./UI";

const easingFactor = 0.5; // Controls the speed of the easing
const easingFactorFold = 0.3; // Controls the speed of the easing
const insideCurveStrength = 0.18; // Controls the strength of the curve
const outsideCurveStrength = 0.05; // Controls the strength of the curve
const turningCurveStrength = 0.09; // Controls the strength of the curve

const PAGE_WIDTH = 1.28;
const PAGE_HEIGHT = 1.28; // 1:1 aspect ratio
const PAGE_DEPTH = 0.003;
const PAGE_SEGMENTS = 24;
const SEGMENT_WIDTH = PAGE_WIDTH / PAGE_SEGMENTS;

const pageGeometry = new BoxGeometry(
  PAGE_WIDTH,
  PAGE_HEIGHT,
  PAGE_DEPTH,
  PAGE_SEGMENTS,
  2
);

pageGeometry.translate(PAGE_WIDTH / 2, 0, 0);

const position = pageGeometry.attributes.position;
const vertex = new Vector3();
const skinIndexes = [];
const skinWeights = [];

for (let i = 0; i < position.count; i++) {
  // ALL VERTICES
  vertex.fromBufferAttribute(position, i); // get the vertex
  const x = vertex.x; // get the x position of the vertex

  const skinIndex = Math.max(0, Math.floor(x / SEGMENT_WIDTH)); // calculate the skin index
  let skinWeight = (x % SEGMENT_WIDTH) / SEGMENT_WIDTH; // calculate the skin weight

  skinIndexes.push(skinIndex, skinIndex + 1, 0, 0); // set the skin indexes
  skinWeights.push(1 - skinWeight, skinWeight, 0, 0); // set the skin weights
}

pageGeometry.setAttribute(
  "skinIndex",
  new Uint16BufferAttribute(skinIndexes, 4)
);
pageGeometry.setAttribute(
  "skinWeight",
  new Float32BufferAttribute(skinWeights, 4)
);

const whiteColor = new Color("white");
const emissiveColor = new Color("orange");

const pageMaterials = [
  new MeshStandardMaterial({
    color: whiteColor,
  }),
  new MeshStandardMaterial({
    color: "#111",
  }),
  new MeshStandardMaterial({
    color: whiteColor,
  }),
  new MeshStandardMaterial({
    color: whiteColor,
  }),
];

const getTexturePath = (name) => {
  if (!name) return ""; // Should not happen for image pages
  if (name.includes(".")) return `/textures/${name}`;
  return `/textures/${name}.jpeg`;
};

pages.forEach((page) => {
  if (page.front && !page.frontText) {
    useTexture.preload(getTexturePath(page.front));
  }
  if (page.back && !page.backText) {
    useTexture.preload(getTexturePath(page.back));
  }
  useTexture.preload(`/textures/book-cover-roughness.jpg`);
});

const createTextTexture = (text) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024; // 1:1 ratio
  const context = canvas.getContext("2d");

  // Background
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Text
  context.font = "bold 24px Georgia";
  context.fillStyle = "black";
  context.textAlign = "left";
  context.textBaseline = "top";

  const maxWidth = canvas.width - 250;
  const lineHeight = 36;
  const paragraphSpacing = 14;
  const x = 150;
  let y = 80;

  const paragraphs = text.split("\n");

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(" ");
    let line = "";

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
    y += lineHeight + paragraphSpacing;
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};


const Page = ({ number, front, back, frontText, backText, page, opened, bookClosed, ...props }) => {

  // Conditionally load textures only if not text
  // We can't conditionally call hooks easily, so we might need a unified loader or handle it.
  // Actually, useTexture can take an array.
  // If frontText is set, front is null/ignored for texture loading.

  const texturesToLoad = [];
  if (!frontText) texturesToLoad.push(`/textures/${front}.jpeg`);
  if (!backText) texturesToLoad.push(`/textures/${back}.jpeg`);
  if (number === 0 || number === pages.length - 1) texturesToLoad.push(`/textures/book-cover-roughness.jpg`);

  // We can't use `useTexture` conditionally inside the component body in a changing way easily.
  // Strategy: Load what we can. If text, we generate manually.
  // For simplicity allowing dynamic texture mapping is hard with hooks. 
  // BETTER APPROACH for this tool: Assume all non-text are images and load them.
  // But wait, `useTexture` will throw if path is invalid or empty.

  // Workaround: Load a placeholder or handle nulls? 
  // Let's optimize: We know exactly what we have. 
  // We can just use `useTexture` for the images we KNOW exist.
  // However, `useTexture` order matters for return.

  // Alternate: Load everything that IS an image. If it's text, pass a dummy image? No.

  // Let's refactor: separate ImagePage and TextPage logic? No, single mesh.
  // Let's just create the texture from text in a useMemo, and pass valid paths to useTexture.

  // To avoid hook rules issues, let's just always request 2 textures, but if text, we request a 1x1 white pixel or existing texture and ignore it.
  // Or better, let's just use `useLoader(TextureLoader, ...)` which might be more flexible?
  // `useTexture` IS `useLoader`.

  // Let's use a dummy texture for text pages to satisfy the hook, then swap it.
  const dummyTexture = "/textures/book-cover-roughness.jpg"; // Guaranteed to exist?

  const frontTexPath = frontText ? dummyTexture : getTexturePath(front);
  const backTexPath = backText ? dummyTexture : getTexturePath(back);

  // Cover roughness
  const roughnessPath = `/textures/book-cover-roughness.jpg`;

  const [loadedFront, loadedBack, loadedRoughness] = useTexture([frontTexPath, backTexPath, roughnessPath]);

  // Generate text textures if needed
  const frontTexture = useMemo(() => {
    if (frontText) return createTextTexture(frontText);
    loadedFront.colorSpace = SRGBColorSpace;
    return loadedFront;
  }, [frontText, loadedFront]);

  const backTexture = useMemo(() => {
    if (backText) return createTextTexture(backText);
    loadedBack.colorSpace = SRGBColorSpace;
    return loadedBack;
  }, [backText, loadedBack]);


  const group = useRef();
  const turnedAt = useRef(0);
  const lastOpened = useRef(opened);

  const skinnedMeshRef = useRef();

  const manualSkinnedMesh = useMemo(() => {
    const bones = [];
    for (let i = 0; i <= PAGE_SEGMENTS; i++) {
      let bone = new Bone();
      bones.push(bone);
      if (i === 0) {
        bone.position.x = 0;
      } else {
        bone.position.x = SEGMENT_WIDTH;
      }
      if (i > 0) {
        bones[i - 1].add(bone); // attach the new bone to the previous bone
      }
    }
    const skeleton = new Skeleton(bones);

    const materials = [
      ...pageMaterials,
      new MeshStandardMaterial({
        color: whiteColor,
        map: frontTexture,
        roughness: 0.5,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
      new MeshStandardMaterial({
        color: whiteColor,
        map: backTexture,
        roughness: 0.5,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
    ];
    const mesh = new SkinnedMesh(pageGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(skeleton.bones[0]);
    mesh.bind(skeleton);
    return mesh;
  }, [frontTexture, backTexture, loadedRoughness]); // Re-create mesh if textures change

  // useHelper(skinnedMeshRef, SkeletonHelper, "red");

  useFrame((_, delta) => {
    if (!skinnedMeshRef.current) {
      return;
    }

    // Emissive intensity logic removed to disable orange hover effect


    if (lastOpened.current !== opened) {
      turnedAt.current = +new Date();
      lastOpened.current = opened;
    }
    let turningTime = Math.min(400, new Date() - turnedAt.current) / 400;
    turningTime = Math.sin(turningTime * Math.PI);

    let targetRotation = opened ? -Math.PI / 2 : Math.PI / 2;
    if (!bookClosed) {
      targetRotation += degToRad(number * 0.8);
    }

    const bones = skinnedMeshRef.current.skeleton.bones;
    for (let i = 0; i < bones.length; i++) {
      const target = i === 0 ? group.current : bones[i];

      const insideCurveIntensity = i < 8 ? Math.sin(i * 0.2 + 0.25) : 0;
      const outsideCurveIntensity = i >= 8 ? Math.cos(i * 0.3 + 0.09) : 0;
      const turningIntensity =
        Math.sin(i * Math.PI * (1 / bones.length)) * turningTime;
      let rotationAngle =
        insideCurveStrength * insideCurveIntensity * targetRotation -
        outsideCurveStrength * outsideCurveIntensity * targetRotation +
        turningCurveStrength * turningIntensity * targetRotation;
      let foldRotationAngle = degToRad(Math.sign(targetRotation) * 2);
      if (bookClosed) {
        if (i === 0) {
          rotationAngle = targetRotation;
          foldRotationAngle = 0;
        } else {
          rotationAngle = 0;
          foldRotationAngle = 0;
        }
      }
      easing.dampAngle(
        target.rotation,
        "y",
        rotationAngle,
        easingFactor,
        delta
      );

      const foldIntensity =
        i > 8
          ? Math.sin(i * Math.PI * (1 / bones.length) - 0.5) * turningTime
          : 0;
      easing.dampAngle(
        target.rotation,
        "x",
        foldRotationAngle * foldIntensity,
        easingFactorFold,
        delta
      );
    }
  });

  const [_, setPage] = useAtom(pageAtom);
  const [highlighted, setHighlighted] = useState(false);
  useCursor(highlighted);

  return (
    <group
      {...props}
      ref={group}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHighlighted(true);
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        setHighlighted(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setPage(opened ? number : number + 1);
        setHighlighted(false);
      }}
    >
      <primitive
        object={manualSkinnedMesh}
        ref={skinnedMeshRef}
        position-z={-number * PAGE_DEPTH + page * PAGE_DEPTH}
      />
    </group>
  );
};

export const Book = ({ ...props }) => {
  const [page] = useAtom(pageAtom);
  const [delayedPage, setDelayedPage] = useState(page);

  useEffect(() => {
    let timeout;
    const goToPage = () => {
      setDelayedPage((delayedPage) => {
        if (page === delayedPage) {
          return delayedPage;
        } else {
          timeout = setTimeout(
            () => {
              goToPage();
            },
            Math.abs(page - delayedPage) > 2 ? 50 : 150
          );
          if (page > delayedPage) {
            return delayedPage + 1;
          }
          if (page < delayedPage) {
            return delayedPage - 1;
          }
        }
      });
    };
    goToPage();
    return () => {
      clearTimeout(timeout);
    };
  }, [page]);

  return (
    <group {...props} rotation-y={-Math.PI / 2}>
      {[...pages].map((pageData, index) => (
        <Page
          key={index}
          page={delayedPage}
          number={index}
          opened={delayedPage > index}
          bookClosed={delayedPage === 0 || delayedPage === pages.length}
          {...pageData}
        />
      ))}
    </group>
  );
};

