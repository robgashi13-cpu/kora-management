'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

type TextMorphProps = {
  children: ReactNode;
  className?: string;
};

const toRenderableText = (children: ReactNode) => {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }

  return '';
};

export function TextMorph({ children, className }: TextMorphProps) {
  const text = toRenderableText(children);

  return (
    <span className={className} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={text}
          initial={{ opacity: 0, filter: 'blur(8px)', y: 8 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          exit={{ opacity: 0, filter: 'blur(8px)', y: -8 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="inline-block"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
