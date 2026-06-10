"use client";
import { useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils/index";

export const ParallaxScroll = ({
  images,
  className,
}: {
  images: string[];
  className?: string;
}) => {
  const gridRef = useRef<any>(null);
  const { scrollYProgress } = useScroll({
    container: gridRef, // remove this if your container is not fixed height
    offset: ["start start", "end start"], // remove this if your container is not fixed height
  });

  const translateFirst = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const translateSecond = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const translateThird = useTransform(scrollYProgress, [0, 1], [0, -120]);

  const third = Math.ceil(images.length / 3);

  const firstPart = images.slice(0, third);
  const secondPart = images.slice(third, 2 * third);
  const thirdPart = images.slice(2 * third);

  return (
    <div
      className={cn(
        "h-[28rem] w-full max-w-full items-start overflow-y-auto overflow-x-hidden @md:h-[32rem]",
        className,
      )}
      ref={gridRef}
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-3 px-3 py-6 @sm:gap-4 @md:grid-cols-2 @md:gap-4 @md:px-4 @lg:grid-cols-3">
        <div className="grid gap-3 @sm:gap-4">
          {firstPart.map((el, idx) => (
            <motion.div
              style={{ y: translateFirst }} // Apply the translateY motion value here
              key={"grid-1" + idx}
            >
              <img
                src={el}
                className="h-40 w-full rounded-lg object-cover object-left-top @md:h-56 !m-0 !p-0"
                height="400"
                width="400"
                alt="thumbnail"
              />
            </motion.div>
          ))}
        </div>
        <div className="grid gap-3 @sm:gap-4">
          {secondPart.map((el, idx) => (
            <motion.div style={{ y: translateSecond }} key={"grid-2" + idx}>
              <img
                src={el}
                className="h-40 w-full rounded-lg object-cover object-left-top @md:h-56 !m-0 !p-0"
                height="400"
                width="400"
                alt="thumbnail"
              />
            </motion.div>
          ))}
        </div>
        <div className="grid gap-3 @sm:gap-4">
          {thirdPart.map((el, idx) => (
            <motion.div style={{ y: translateThird }} key={"grid-3" + idx}>
              <img
                src={el}
                className="h-40 w-full rounded-lg object-cover object-left-top @md:h-56 !m-0 !p-0"
                height="400"
                width="400"
                alt="thumbnail"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
