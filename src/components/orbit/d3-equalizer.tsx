import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface D3EqualizerProps {
  active: boolean;
  barCount?: number;
  height?: number;
  width?: number;
}

export function D3Equalizer({ active, barCount = 12, height = 28, width = 120 }: D3EqualizerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const data = Array.from({ length: barCount }, () => (active ? Math.random() * 0.8 + 0.2 : 0.1));
    const barWidth = width / barCount - 2;

    const g = svg.append("g");

    const bars = g
      .selectAll("rect")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (d, i) => i * (width / barCount))
      .attr("y", (d) => height * (1 - d))
      .attr("width", Math.max(2, barWidth))
      .attr("height", (d) => height * d)
      .attr("rx", 1.5)
      .attr("fill", "currentColor")
      .attr("opacity", (d) => (active ? 0.85 + d * 0.15 : 0.3));

    if (!active) return;

    let timerId: number;
    const update = () => {
      const newData = Array.from({ length: barCount }, () => Math.random() * 0.85 + 0.15);
      bars
        .data(newData)
        .transition()
        .duration(120)
        .ease(d3.easeCubicOut)
        .attr("y", (d) => height * (1 - d))
        .attr("height", (d) => height * d);

      timerId = window.setTimeout(update, 150);
    };

    const initialTimer = window.setTimeout(update, 150);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearTimeout(timerId);
    };
  }, [active, barCount, height, width]);

  return (
    <svg ref={svgRef} width={width} height={height} className="text-accent overflow-visible" />
  );
}
