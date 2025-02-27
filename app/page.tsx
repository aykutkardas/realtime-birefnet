/* eslint-disable @next/next/no-img-element */
"use client";

import * as fal from "@fal-ai/serverless-client";
import { MutableRefObject, useEffect, useRef, useState } from "react";

fal.config({
  proxyUrl: "/api/fal/proxy",
});

const EMPTY_IMG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdjOHPmzH8ACDADZKt3GNsAAAAASUVORK5CYII=";

type WebcamOptions = {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  previewRef: MutableRefObject<HTMLCanvasElement | null>;
  onFrameUpdate?: (data: Uint8Array) => void;
  width?: number;
  height?: number;
};
const useWebcam = ({
  videoRef,
  previewRef,
  onFrameUpdate,
  width = 512,
  height = 512,
}: WebcamOptions) => {
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
        if (videoRef.current !== null) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      });
    }
  }, [videoRef]);

  const captureFrame = () => {
    const canvas = previewRef.current;
    const video = videoRef.current;
    if (canvas === null || video === null) {
      return;
    }

    // Calculate the aspect ratio and crop dimensions
    const aspectRatio = video.videoWidth / video.videoHeight;
    let sourceX, sourceY, sourceWidth, sourceHeight;

    if (aspectRatio > 1) {
      // If width is greater than height
      sourceWidth = video.videoHeight;
      sourceHeight = video.videoHeight;
      sourceX = (video.videoWidth - video.videoHeight) / 2;
      sourceY = 0;
    } else {
      // If height is greater than or equal to width
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoWidth;
      sourceX = 0;
      sourceY = (video.videoHeight - video.videoWidth) / 2;
    }

    // Resize the canvas to the target dimensions
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }

    // Draw the image on the canvas (cropped and resized)
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height
    );

    // Callback with frame data
    if (onFrameUpdate) {
      canvas.toBlob(
        (blob) => {
          blob?.arrayBuffer().then((buffer) => {
            const frameData = new Uint8Array(buffer);
            onFrameUpdate(frameData);
          });
        },
        "image/jpeg",
        0.7
      );
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      captureFrame();
    }, 16); // Adjust interval as needed

    return () => clearInterval(interval);
  });
};

type BirefNetInput = {
  image_bytes: Uint8Array;
};

type BirefNetOutput = {
  image: { content: Uint8Array };
};

export default function WebcamPage() {
  const [enabled, setEnabled] = useState(false);
  const processedImageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [numberOfFrames, setNumberOfFrames] = useState(0);
  const [numberOfSeconds, setNumberOfSeconds] = useState(0);

  const { send } = fal.realtime.connect<BirefNetInput, BirefNetOutput>(
    "fal-ai/birefnet",
    {
      connectionKey: "birefnet-demo",
      // not throttling the client, handling throttling of the camera itself
      // and letting all requests through in real-time
      throttleInterval: 0,
      onResult(result) {
        if (processedImageRef.current && result.image) {
          setNumberOfFrames(numberOfFrames + 1);
          const blob = new Blob([result.image.content], { type: "image/webp" });
          const url = URL.createObjectURL(blob);
          processedImageRef.current.src = url;
        }
      },
    }
  );

  const timer = () => {
    setNumberOfSeconds(numberOfSeconds + 1);
  };

  useEffect(() => {
    if (enabled) {
      const intervalId = setInterval(timer, 1000);
      return () => clearInterval(intervalId);
    } else {
      setNumberOfSeconds(0);
    }
  }, [numberOfSeconds, enabled]);

  const onFrameUpdate = (data: Uint8Array) => {
    if (!enabled) {
      return;
    }
    send({
      image_bytes: data,
    });
  };

  useWebcam({
    videoRef,
    previewRef,
    onFrameUpdate,
  });

  return (
    <main className="flex-col px-32 mx-auto my-20">
      <h1 className="text-4xl font-mono mb-8 text-current text-center">
        fal realtime <code className="font-light text-pink-600">birefnet</code>
      </h1>
      <video ref={videoRef} style={{ display: "none" }}></video>
      <div className="py-12 flex items-center justify-center">
        <button
          className="py-3 px-4 bg-indigo-700 text-white text-lg rounded"
          onClick={() => {
            setEnabled(!enabled);
          }}
        >
          {enabled ? "Stop" : "Start"}
        </button>
      </div>
      <div> frame rate: {(numberOfFrames / numberOfSeconds).toFixed()}</div>
      <div> timer: {numberOfSeconds.toFixed()}</div>
      <div> number of frames: {numberOfFrames}</div>
      <div className="flex flex-col lg:flex-row space-y-4 lg:space-y-0 lg:space-x-4 justify-between">
        <canvas ref={previewRef} width="512" height="512"></canvas>
        <img
          ref={processedImageRef}
          src={EMPTY_IMG}
          width={512}
          height={512}
          className="min-w-[512px] min-h-[512px]"
          alt="generated"
        />
      </div>
    </main>
  );
}
