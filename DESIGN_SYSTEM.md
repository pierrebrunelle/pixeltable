# Pixeltable Design System

A comprehensive guide to the Pixeltable "Kandinsky" design system. This document contains everything needed to replicate the theme in another codebase.

## Table of Contents

1. [Quick Start](#quick-start)
2. [CSS Variables](#css-variables)
3. [Tailwind Configuration](#tailwind-configuration)
4. [Color Reference](#color-reference)
5. [Typography](#typography)
6. [Component Examples](#component-examples)
7. [Animation Library](#animation-library)
8. [Utility Classes](#utility-classes)
9. [Best Practices](#best-practices)

---

## Quick Start

### Dependencies

```bash
npm install tailwindcss tailwind-merge clsx class-variance-authority @radix-ui/react-slot framer-motion
npm install -D tailwindcss-animate @tailwindcss/typography
```

### Font Setup (Next.js)

```tsx
// app/layout.tsx
import { Inter } from "next/font/google";

const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  preload: true,
  variable: '--font-inter'
});

// Apply to html: className={inter.variable}
```

### Utility Function

```typescript
// lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## CSS Variables

Add these to your `globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    scroll-behavior: smooth;
    -webkit-text-size-adjust: 100%;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    min-height: 100vh;
    min-height: 100dvh;
    line-height: 1.6;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  /* Prevent iOS zoom on inputs */
  input, textarea, select {
    font-size: 16px;
    max-width: 100%;
  }

  :root {
    /* ============================================
       KANDINSKY BRAND COLORS
       ============================================ */
    --kandinsky-yellow: 42 98% 48%;      /* #F1AE03 */
    --kandinsky-red: 9 97% 44%;          /* #DC2404 */
    --kandinsky-red-dark: 9 98% 40%;     /* #C82302 */
    --kandinsky-black: 120 8% 3%;        /* #020704 */
    --kandinsky-blue: 213 96% 18%;       /* #022A59 */
    --kandinsky-blue-light: 217 79% 71%; /* #7DA8EF */
    --kandinsky-gray: 27 8% 63%;         /* #AAA498 */
    --kandinsky-cta: 0 100% 1%;          /* #070000 - Primary CTA */

    /* ============================================
       LIGHT THEME PALETTE
       ============================================ */
    --kandinsky-light: 40 9% 98%;        /* #fafaf9 - Clean background */
    --kandinsky-light-card: 0 0% 100%;   /* Pure white for cards */
    --kandinsky-light-hover: 40 6% 95%;  /* #f4f4f3 - Hover state */
    --kandinsky-light-border: 0 0% 88%;  /* #e0e0e0 - Borders */
    --kandinsky-text: 0 0% 35%;          /* #595959 - Muted text */

    /* ============================================
       SEMANTIC VARIABLES - LIGHT THEME
       ============================================ */
    --background: var(--kandinsky-light);
    --foreground: var(--kandinsky-cta);

    --card: var(--kandinsky-light-card);
    --card-foreground: var(--kandinsky-cta);

    --popover: var(--kandinsky-light-card);
    --popover-foreground: var(--kandinsky-cta);

    --primary: var(--kandinsky-cta);
    --primary-foreground: 0 0% 98%;

    --secondary: var(--kandinsky-text);
    --secondary-foreground: 0 0% 98%;

    --muted: var(--kandinsky-light-hover);
    --muted-foreground: var(--kandinsky-text);

    --accent: var(--kandinsky-light-hover);
    --accent-foreground: var(--kandinsky-cta);

    --destructive: 10 97% 44%;
    --destructive-foreground: 0 0% 98%;

    --border: var(--kandinsky-light-border);
    --input: var(--kandinsky-light-border);
    --ring: var(--kandinsky-cta);

    --radius: 0.5rem;

    /* Section accent colors */
    --section-datastore: var(--kandinsky-blue);
    --section-incremental: var(--kandinsky-yellow);
    --section-declarative: var(--kandinsky-red);
  }

  /* ============================================
     DARK THEME
     ============================================ */
  .dark {
    --background: var(--kandinsky-black);
    --foreground: 0 0% 95%;

    --card: 120 8% 6%;               /* #0E110E */
    --card-foreground: 0 0% 95%;

    --popover: 120 8% 6%;
    --popover-foreground: 0 0% 95%;

    --primary: var(--kandinsky-yellow);
    --primary-foreground: var(--kandinsky-black);

    --secondary: 0 0% 18%;
    --secondary-foreground: 0 0% 98%;

    --muted: 120 8% 10%;
    --muted-foreground: 0 0% 65%;

    --accent: 0 0% 15%;
    --accent-foreground: 0 0% 90%;

    --destructive: var(--kandinsky-red);
    --destructive-foreground: 0 0% 98%;

    --border: 0 0% 22%;
    --input: 0 0% 25%;
    --ring: var(--kandinsky-yellow);
  }

  /* Apply border color globally */
  * {
    @apply border-border;
    box-sizing: border-box;
  }

  body {
    @apply bg-background text-foreground font-sans leading-relaxed;
  }

  /* Responsive typography */
  h1 { @apply text-3xl sm:text-4xl md:text-5xl; }
  h2 { @apply text-2xl sm:text-3xl md:text-4xl; }
  h3 { @apply text-xl sm:text-2xl md:text-3xl; }
  
  h1, h2, h3, h4, h5, h6 {
    @apply font-medium tracking-tight;
  }
}
```

---

## Tailwind Configuration

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        'xs': '475px',
      },
      maxWidth: {
        'content': '1200px',
        'content-wide': '1400px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      colors: {
        // Kandinsky brand colors
        kandinsky: {
          yellow: '#F1AE03',
          red: '#DC2404',
          'red-dark': '#C82302',
          'red-hover': '#D12705',
          blue: '#022A59',
          'blue-hover': '#08407B',
          'blue-light': '#7DA8EF',
          'yellow-hover': '#F6B506',
          black: '#020704',
          cta: '#070000',
          gray: '#AAA498',
          text: '#595959',
          light: '#fafaf9',
          'light-card': '#ffffff',
          'light-hover': '#f4f4f3',
          'light-border': '#e0e0e0',
        },
        // Semantic colors (HSL variables)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        kandinsky: '1rem 0.25rem 1rem 0.25rem', // Asymmetric corners
        'kandinsky-pill': '9999px',
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        "gradient": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-25%)" },
        },
        "subtle-pulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.85 },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "gradient": "gradient 8s linear infinite",
        "bounce": "bounce 1s ease-in-out infinite",
        "subtle-pulse": "subtle-pulse 3s ease-in-out infinite",
        "spin-slow": "spin-slow 8s linear infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require('@tailwindcss/typography'),
  ],
};
```

---

## Color Reference

### Brand Colors (Kandinsky Palette)

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| Yellow | `#F1AE03` | `42 98% 48%` | Dark mode primary, accents |
| Red | `#DC2404` | `9 97% 44%` | Destructive, warnings, declarative section |
| Blue | `#022A59` | `213 96% 18%` | Links, datastore section |
| Blue Light | `#7DA8EF` | `217 79% 71%` | Hover states, highlights |
| Black | `#020704` | `120 8% 3%` | Dark mode background |
| CTA Black | `#070000` | `0 100% 1%` | Light mode primary buttons |
| Gray | `#AAA498` | `27 8% 63%` | Muted elements |
| Text Gray | `#595959` | `0 0% 35%` | Secondary text |

### Light Theme

| Variable | Hex | Usage |
|----------|-----|-------|
| Background | `#fafaf9` | Page background |
| Card | `#ffffff` | Card surfaces |
| Hover | `#f4f4f3` | Hover states |
| Border | `#e0e0e0` | Borders, dividers |

### Dark Theme

| Variable | Hex | Usage |
|----------|-----|-------|
| Background | `#020704` | Page background |
| Card | `#0E110E` | Card surfaces |
| Border | ~22% gray | Borders, dividers |

---

## Typography

### Font Stack

```css
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 
  "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
```

### Responsive Scale

```css
/* Applied via Tailwind @apply in base layer */
h1 { @apply text-3xl sm:text-4xl md:text-5xl; }  /* 1.875rem → 2.25rem → 3rem */
h2 { @apply text-2xl sm:text-3xl md:text-4xl; }  /* 1.5rem → 1.875rem → 2.25rem */
h3 { @apply text-xl sm:text-2xl md:text-3xl; }   /* 1.25rem → 1.5rem → 1.875rem */
```

### Text Utilities

```css
/* Responsive text sizes using clamp */
.text-responsive-sm { font-size: clamp(0.875rem, 2.5vw, 1rem); }
.text-responsive-base { font-size: clamp(1rem, 3vw, 1.125rem); }
.text-responsive-lg { font-size: clamp(1.125rem, 4vw, 1.25rem); }
```

---

## Component Examples

### Button Component

```tsx
// components/ui/Button.tsx
import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-40 disabled:pointer-events-none rounded-md",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-kandinsky-yellow dark:hover:bg-primary/90 hover:text-kandinsky-black",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-kandinsky-yellow dark:hover:bg-secondary/80 hover:text-kandinsky-black dark:hover:text-secondary-foreground",
        ghost: "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto rounded-none",
        outline: "border border-border/80 bg-card text-foreground hover:bg-accent/80 hover:border-border",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4 text-[13px]",
        lg: "h-10 px-5 text-sm",
        icon: "h-9 w-9 p-0",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, isLoading, leftIcon, rightIcon, children, disabled, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <LoadingSpinner className="mr-2" />}
        {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </Comp>
    );
  }
);

Button.displayName = "Button";
export { Button, buttonVariants };
```

### Card Component

```tsx
// components/ui/Card.tsx
import React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight text-card-foreground", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
```

### Input Component

```tsx
// components/ui/Input.tsx
import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, leftIcon, rightIcon, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={props.id} className="block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            className={cn(
              "w-full rounded-md border border-input bg-background px-4 py-2 text-foreground",
              "focus:border-border focus:outline-none transition-colors",
              "placeholder:text-muted-foreground",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              error && "border-destructive focus:border-destructive",
              className
            )}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export { Input };
```

### Kandinsky Loading Spinner

```tsx
// components/ui/KandinskyLoadingSpinner.tsx
"use client";

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface KandinskyLoadingSpinnerProps {
  className?: string;
  size?: number;
}

export function KandinskyLoadingSpinner({ className, size = 64 }: KandinskyLoadingSpinnerProps) {
  const shapeSize = size / 4;
  const orbitRadius = size / 3;

  // Light mode: monochrome, Dark mode: colorful Kandinsky shapes
  const shapes = [
    { lightColor: 'bg-primary', darkColor: 'bg-kandinsky-yellow', initialAngle: 0 },
    { lightColor: 'bg-primary', darkColor: 'bg-kandinsky-red', initialAngle: 120 },
    { lightColor: 'bg-primary', darkColor: 'bg-kandinsky-blue', initialAngle: 240 },
  ];

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      {shapes.map((shape, index) => (
        <motion.div
          key={index}
          className={cn("absolute", shape.lightColor, `dark:${shape.darkColor}`)}
          style={{
            width: shapeSize,
            height: shapeSize,
            left: (size - shapeSize) / 2,
            top: (size - shapeSize) / 2,
          }}
          animate={{
            transform: [
              `rotate(${shape.initialAngle}deg) translateX(${orbitRadius}px) rotate(-${shape.initialAngle}deg) scale(1)`,
              `rotate(${shape.initialAngle + 360}deg) translateX(${orbitRadius}px) rotate(-${shape.initialAngle + 360}deg) scale(0.7)`,
              `rotate(${shape.initialAngle + 720}deg) translateX(${orbitRadius}px) rotate(-${shape.initialAngle + 720}deg) scale(1)`,
            ],
          }}
          transition={{
            duration: 2.5,
            ease: "easeInOut",
            repeat: Infinity,
            delay: index * 0.2,
          }}
        />
      ))}
    </div>
  );
}
```

---

## Animation Library

### CSS Keyframes

Add these to your `globals.css`:

```css
@layer components {
  /* Fade in animation */
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Slide up animation */
  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Floating animation for particles */
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }

  /* Gradient animation */
  @keyframes gradient-x {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  /* Shimmer effect */
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  /* Pulse glow effect */
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 5px rgba(var(--primary), 0.5); }
    50% { box-shadow: 0 0 20px rgba(var(--primary), 0.8), 0 0 30px rgba(var(--primary), 0.6); }
  }

  /* Tilt animation */
  @keyframes tilt {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(1deg); }
    75% { transform: rotate(-1deg); }
  }

  /* Utility classes */
  .fade-in { animation: fade-in 0.6s ease-out forwards; }
  .slide-up { animation: slide-up 0.6s ease-out forwards; }
  .animate-float { animation: float 3s ease-in-out infinite; }
  .animate-gradient-x {
    background-size: 200% 200%;
    animation: gradient-x 3s ease infinite;
  }
  .animate-tilt { animation: tilt 10s infinite ease-in-out; }
  .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
}

/* Navigation menu animations */
@keyframes enterFromRight {
  from { opacity: 0; transform: translateX(200px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes enterFromLeft {
  from { opacity: 0; transform: translateX(-200px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes exitToRight {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(200px); }
}

@keyframes exitToLeft {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(-200px); }
}

/* Accordion animations */
@layer utilities {
  .animate-slideDown {
    animation: slideDown 300ms cubic-bezier(0.87, 0, 0.13, 1);
  }

  .animate-slideUp {
    animation: slideUp 300ms cubic-bezier(0.87, 0, 0.13, 1);
  }

  @keyframes slideDown {
    from { height: 0; }
    to { height: var(--radix-accordion-content-height); }
  }

  @keyframes slideUp {
    from { height: var(--radix-accordion-content-height); }
    to { height: 0; }
  }
}
```

---

## Utility Classes

### Scrollbar Styling

```css
@layer utilities {
  /* Hide scrollbar completely */
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  /* Thin subtle scrollbar */
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--muted-foreground), 0.3) transparent;
  }
  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: rgba(var(--muted-foreground), 0.3);
    border-radius: 3px;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background-color: rgba(var(--muted-foreground), 0.5);
  }

  /* Themed sidebar scrollbar */
  .scrollbar-sidebar {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--kandinsky-blue) / 0.2) transparent;
  }
  .scrollbar-sidebar::-webkit-scrollbar {
    width: 8px;
  }
  .scrollbar-sidebar::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, hsl(var(--kandinsky-blue) / 0.15), hsl(var(--kandinsky-blue) / 0.25));
    border-radius: 4px;
  }
  .dark .scrollbar-sidebar {
    scrollbar-color: hsl(var(--kandinsky-yellow) / 0.2) transparent;
  }
  .dark .scrollbar-sidebar::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, hsl(var(--kandinsky-yellow) / 0.1), hsl(var(--kandinsky-yellow) / 0.2));
  }
}
```

### Line Clamp

```css
@layer utilities {
  .line-clamp-1 {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }
  .line-clamp-2 {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .line-clamp-3 {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }
}
```

### Mobile Utilities

```css
@layer utilities {
  /* Touch-friendly interactions */
  .touch-optimized {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  /* Better mobile text */
  .mobile-text-optimize {
    text-rendering: optimizeLegibility;
    font-feature-settings: "liga", "kern";
  }

  /* Safe area for notched devices */
  .safe-area-top { padding-top: env(safe-area-inset-top); }
  .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }

  /* Mobile-specific spacing */
  .mobile-padding {
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 
             max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }

  /* Mobile media query utilities */
  @media (max-width: 640px) {
    .mobile\:hidden { display: none; }
    .mobile\:text-center { text-align: center; }
    .mobile\:w-full { width: 100%; }
  }
}
```

---

## Best Practices

### Theme Switching

Use the `class` strategy for dark mode (configured in Tailwind). Toggle by adding/removing the `dark` class on the `<html>` element:

```tsx
// Example theme toggle
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
}
```

Or use `next-themes` for Next.js:

```tsx
// app/layout.tsx
import { ThemeProvider } from 'next-themes';

export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Accessibility

1. **Focus rings**: All interactive elements have visible focus states via `focus-visible:ring-2`
2. **Color contrast**: Light theme uses near-black text (#070000) on off-white; dark uses off-white on black
3. **Touch targets**: Minimum 44px tap targets on mobile (enforced via button sizes)
4. **Reduced motion**: Consider adding `prefers-reduced-motion` media queries for animations

### Component Patterns

1. **Use `cn()` utility**: Always combine classes with the `cn()` function for proper merging
2. **Forward refs**: All components should forward refs for composition
3. **Semantic colors**: Prefer semantic variables (`bg-card`, `text-foreground`) over direct colors
4. **Variants with CVA**: Use class-variance-authority for component variants

### Performance

1. **Font preloading**: Use `display: 'swap'` and `preload: true` for fonts
2. **CSS containment**: Use `contain: layout style` where appropriate
3. **Dynamic viewport**: Use `100dvh` for full-height layouts on mobile

---

## Code Syntax Highlighting (Prism Theme)

Night Owl-inspired theme for code blocks:

```css
/* Prism syntax highlighting styles */
.token.comment, .token.prolog, .token.doctype, .token.cdata {
  color: #637777;
  font-style: italic;
}

.token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol {
  color: #FF9D00;
}

.token.selector, .token.attr-name, .token.string, .token.char, .token.builtin {
  color: #2AA198;
}

.token.operator, .token.entity, .token.url, .token.variable {
  color: #F8F8F2;
}

.token.atrule, .token.attr-value, .token.function {
  color: #7FDBCA;
}

.token.keyword {
  color: #C792EA;
}

.token.class-name {
  color: #FFCB6B;
}

.token.punctuation {
  color: #89DDFF;
}

.token.deleted {
  color: #FF5370;
}

.token.inserted {
  color: #82AAFF;
}
```

---

## Summary

This design system provides:

- **Consistent theming** with HSL-based CSS variables
- **Automatic dark mode** via the `.dark` class
- **Responsive typography** with mobile-first breakpoints
- **Reusable components** (Button, Card, Input) with variants
- **Custom animations** for engaging UI interactions
- **Mobile-optimized utilities** for touch and notched devices

Copy the relevant sections into your project and customize as needed!
