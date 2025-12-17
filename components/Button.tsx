import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  icon,
  ...props 
}) => {
  const baseStyles = "relative px-6 py-3 font-mono font-bold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 group overflow-hidden rounded-sm";
  
  const variants = {
    primary: "bg-neon-blue/10 text-neon-blue border border-neon-blue hover:bg-neon-blue hover:text-black hover:shadow-[0_0_20px_rgba(0,243,255,0.6)]",
    secondary: "bg-white/5 text-gray-300 border border-white/20 hover:bg-white/10 hover:border-white/40",
    danger: "bg-red-500/10 text-red-500 border border-red-500 hover:bg-red-500 hover:text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.6)]"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-2">{icon}{children}</span>
    </button>
  );
};