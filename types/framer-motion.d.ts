declare module 'framer-motion' {
  import type { ComponentProps, ReactNode, Ref, CSSProperties } from 'react';

  export interface PanInfo {
    point: { x: number; y: number };
    delta: { x: number; y: number };
    offset: { x: number; y: number };
    velocity: { x: number; y: number };
  }

  export interface MotionValue<T = any> {
    get(): T;
    set(value: T): void;
    on(event: string, callback: (value: T) => void): () => void;
  }

  export interface MotionStyle
    extends Omit<
      CSSProperties,
      | 'x'
      | 'y'
      | 'z'
      | 'rotate'
      | 'scale'
      | 'rotateX'
      | 'rotateY'
      | 'rotateZ'
      | 'scaleX'
      | 'scaleY'
    > {
    x?: number | string | MotionValue;
    y?: number | string | MotionValue;
    z?: number | string | MotionValue;
    rotate?: number | string | MotionValue;
    rotateX?: number | string | MotionValue;
    rotateY?: number | string | MotionValue;
    rotateZ?: number | string | MotionValue;
    scale?: number | string | MotionValue;
    scaleX?: number | string | MotionValue;
    scaleY?: number | string | MotionValue;
    opacity?: number | MotionValue;
  }

  export type MotionDragEventHandler = (event: any, info: PanInfo) => void;

  export interface MotionProps {
    animate?: any;
    initial?: any;
    exit?: any;
    whileHover?: any;
    whileTap?: any;
    whileDrag?: any;
    transition?: any;
    variants?: any;
    custom?: any;
    onAnimationStart?: () => void;
    onAnimationComplete?: () => void;
    children?: ReactNode;
    className?: string;
    style?: MotionStyle;
    layout?: boolean | string;
    layoutId?: string;
    drag?: boolean | 'x' | 'y';
    dragElastic?: boolean | number;
    dragMomentum?: boolean;
    dragConstraints?: any;
    onDrag?: MotionDragEventHandler;
    onDragStart?: MotionDragEventHandler;
    onDragEnd?: MotionDragEventHandler;
    onViewportEnter?: () => void;
    onViewportLeave?: () => void;
    onHoverStart?: (event: any, info: any) => void;
    onHoverEnd?: (event: any, info: any) => void;
    ref?: Ref<any>;
    onClick?: (event: any) => void;
    onKeyDown?: (event: any) => void;
  }

  export interface AnimatePresenceProps {
    children?: ReactNode;
    initial?: boolean;
    exitBeforeEnter?: boolean;
    onExitComplete?: () => void;
    mode?: 'wait' | 'sync' | 'popLayout';
  }

  type MotionComponentProps<T extends keyof JSX.IntrinsicElements> =
    MotionProps &
      Omit<
        ComponentProps<T>,
        | 'onDrag'
        | 'onDragStart'
        | 'onDragEnd'
        | 'onAnimationStart'
        | 'onAnimationEnd'
      >;

  export const motion: {
    div: React.ForwardRefExoticComponent<MotionComponentProps<'div'>>;
    button: React.ForwardRefExoticComponent<MotionComponentProps<'button'>>;
    span: React.ForwardRefExoticComponent<MotionComponentProps<'span'>>;
    p: React.ForwardRefExoticComponent<MotionComponentProps<'p'>>;
    h1: React.ForwardRefExoticComponent<MotionComponentProps<'h1'>>;
    h2: React.ForwardRefExoticComponent<MotionComponentProps<'h2'>>;
    h3: React.ForwardRefExoticComponent<MotionComponentProps<'h3'>>;
    h4: React.ForwardRefExoticComponent<MotionComponentProps<'h4'>>;
    svg: React.ForwardRefExoticComponent<MotionComponentProps<'svg'>>;
    path: React.ForwardRefExoticComponent<MotionComponentProps<'path'>>;
    ul: React.ForwardRefExoticComponent<MotionComponentProps<'ul'>>;
    li: React.ForwardRefExoticComponent<MotionComponentProps<'li'>>;
    form: React.ForwardRefExoticComponent<MotionComponentProps<'form'>>;
    textarea: React.ForwardRefExoticComponent<MotionComponentProps<'textarea'>>;
    input: React.ForwardRefExoticComponent<MotionComponentProps<'input'>>;
    section: React.ForwardRefExoticComponent<MotionComponentProps<'section'>>;
  };

  export const AnimatePresence: React.FC<AnimatePresenceProps>;
  export const useAnimation: () => any;
  export const useMotionValue: <T = any>(initial: T) => MotionValue<T>;
  export const useTransform: <T = any>(
    value: MotionValue,
    input: number[],
    output: T[],
  ) => MotionValue<T>;
  export const useSpring: (
    value: MotionValue | number,
    config?: any,
  ) => MotionValue;
  export const useDragControls: () => any;
  export const useAnimationControls: () => any;
}
