
import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

// Fix: Change interface inheritance to HTMLMotionProps to avoid type conflicts with framer-motion
interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', fullWidth, className = '', ...props 
}) => {
  const baseClasses = "relative overflow-hidden font-medium py-2 px-4 rounded shadow-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    // تم تغيير اللون من الأزرق الثابت إلى bg-primary المرتبط بالثيم
    primary: "bg-primary hover:opacity-90 text-white focus:ring-primary shadow-lg shadow-primary/30",
    secondary: "bg-gray-600 hover:bg-gray-700 text-white focus:ring-gray-500",
    danger: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-red-500/30",
    outline: "bg-transparent border-2 border-primary text-primary hover:bg-primary/10"
  };

  // Determine shake effect for danger buttons or error states
  const shouldShake = variant === 'danger';

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      animate={shouldShake ? { x: [0, -2, 2, -2, 2, 0] } : {}}
      transition={shouldShake ? { duration: 0.4, repeat: 0 } : {}}
      className={`${baseClasses} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
};
