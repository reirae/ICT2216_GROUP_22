import React from "react";
import { Shield } from "lucide-react";

interface LoadingSpinnerProps {
  /** Size of the outer spinner ring in pixels (default: 128) */
  size?: number;
  /** Tailwind color class for the spinner ring (default: "border-blue-600") */
  ringColorClass?: string;
  /** Tailwind color class for the Shield icon (default: "text-blue-600") */
  iconColorClass?: string;
  /** Optional additional className for the wrapper */
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 128,
  ringColorClass = "border-blue-600",
  iconColorClass = "text-blue-600",
  className = "",
}) => {
  const iconSize = Math.round(size * 0.45); // ~58px when size=128

  return (
    <div
      className={`relative flex justify-center items-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Spinning ring */}
      <div
        className={`absolute animate-spin rounded-full border-t-4 border-b-4 border-x-transparent ${ringColorClass}`}
        style={{ width: size, height: size }}
      />

      {/* Center Shield icon */}
      <Shield
        className={iconColorClass}
        style={{ width: iconSize, height: iconSize }}
      />
    </div>
  );
};

export default LoadingSpinner;