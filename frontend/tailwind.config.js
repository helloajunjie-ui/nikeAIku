/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        niko: {
          bg: '#13141c',
          surface: '#1c1d26',
          accent: '#a21caf',
        },
      },
      transitionTimingFunction: {
        // ColorOS 标志性的弹性阻尼曲线
        'aqua': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        'bounce-soft': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      boxShadow: {
        // 极柔和的光学折射阴影
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'neon-purple': '0 0 20px rgba(168, 85, 247, 0.15)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
