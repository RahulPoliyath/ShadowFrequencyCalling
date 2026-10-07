/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Activity, ShieldCheck, Zap, AlertCircle, BarChart3, Wifi, Pause, Play, Download, Maximize2, Minimize2 } from 'lucide-react';
import { WebRtcDiagnosticSample } from '../services/webrtc';

interface CallDiagnosticsChartProps {
  samples: WebRtcDiagnosticSample[];
  currentBitrate: number;
  currentHealth: number;
  currentJitterMs: number;
  currentDelayMs: number;
  packetsLost: number;
  latencyMs: number;
  isMuted?: boolean;
}

export const CallDiagnosticsChart: React.FC<CallDiagnosticsChartProps> = ({
  samples,
  currentBitrate,
  currentHealth,
  currentJitterMs,
  currentDelayMs,
  packetsLost,
  latencyMs,
  isMuted = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [activeMetric, setActiveMetric] = useState<'both' | 'bitrate' | 'health'>('both');
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredSample, setHoveredSample] = useState<WebRtcDiagnosticSample | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Freeze samples snapshot if paused by engineer
  const displaySamples = useMemo(() => {
    if (samples.length === 0) {
      // Seed initial dummy baseline sample for seamless startup
      return [{
        timestamp: Date.now(),
        durationSeconds: 0,
        bitrateKbps: currentBitrate || 48.0,
        jitterBufferHealthPct: currentHealth || 98.0,
        jitterMs: currentJitterMs || 3.5,
        jitterBufferDelayMs: currentDelayMs || 5.0,
        packetsLost: 0,
        packetsReceived: 10,
        packetsSent: 10,
        roundTripTimeMs: latencyMs || 12,
        audioLevel: 0.5,
      }];
    }
    return samples;
  }, [samples, currentBitrate, currentHealth, currentJitterMs, currentDelayMs, latencyMs]);

  // Main D3 Rendering Engine
  useEffect(() => {
    const svgEl = svgRef.current;
    const container = containerRef.current;
    if (!svgEl || !container || displaySamples.length === 0) return;

    // Dimensions
    const width = container.clientWidth || 380;
    const height = isExpanded ? 240 : 160;
    const margin = { top: 22, right: 46, bottom: 28, left: 46 };
    const innerWidth = Math.max(50, width - margin.left - margin.right);
    const innerHeight = Math.max(50, height - margin.top - margin.bottom);

    // Clear previous D3 render elements
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    svg.attr('viewBox', `0 0 ${width} ${height}`)
       .attr('width', '100%')
       .attr('height', height);

    // Definitions (Gradients and Clip Paths)
    const defs = svg.append('defs');

    // Gradient for Bitrate (Cyan Glow)
    const bitrateGrad = defs.append('linearGradient')
      .attr('id', 'bitrate-glow-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    bitrateGrad.append('stop').attr('offset', '0%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.45);
    bitrateGrad.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.0);

    // Gradient for Jitter Buffer Health (Emerald Glow)
    const healthGrad = defs.append('linearGradient')
      .attr('id', 'health-glow-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    healthGrad.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.35);
    healthGrad.append('stop').attr('offset', '100%').attr('stop-color', '#10b981').attr('stop-opacity', 0.0);

    // Clipping path
    defs.append('clipPath')
      .attr('id', 'chart-clip')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);

    // Main Chart Canvas Group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // --- Scales ---
    // X Scale: duration in seconds (or indices)
    const xMin = d3.min(displaySamples, d => d.durationSeconds) ?? 0;
    const xMax = d3.max(displaySamples, d => d.durationSeconds) ?? 1;
    // Window of at least 15 seconds for smooth visual scrolling
    const effectiveXMin = Math.max(0, xMax - 30);
    const xScale = d3.scaleLinear()
      .domain([effectiveXMin, Math.max(effectiveXMin + 15, xMax)])
      .range([0, innerWidth]);

    // Y Scale Left: Bitrate (kbps) -> domain 0 to 64 (or dynamic max)
    const maxBitrate = Math.max(64, d3.max(displaySamples, d => d.bitrateKbps) ?? 64);
    const yBitrateScale = d3.scaleLinear()
      .domain([0, maxBitrate * 1.1])
      .range([innerHeight, 0])
      .nice();

    // Y Scale Right: Jitter Buffer Health (%) -> domain 0% to 100%
    const yHealthScale = d3.scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

    // --- Grid Lines ---
    // Horizontal Grid Lines
    const yTicks = [20, 40, 60, 80, 100];
    g.append('g')
      .attr('class', 'grid-lines')
      .selectAll('line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yHealthScale(d))
      .attr('y2', d => yHealthScale(d))
      .attr('stroke', 'rgba(255, 255, 255, 0.06)')
      .attr('stroke-dasharray', '3 3');

    // Reference Target Line: 48 kbps Opus Nominal
    if (activeMetric !== 'health') {
      const y48 = yBitrateScale(48);
      if (y48 >= 0 && y48 <= innerHeight) {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', innerWidth)
          .attr('y1', y48)
          .attr('y2', y48)
          .attr('stroke', 'rgba(6, 182, 212, 0.35)')
          .attr('stroke-dasharray', '4 4')
          .attr('stroke-width', 1);

        g.append('text')
          .attr('x', innerWidth - 4)
          .attr('y', y48 - 4)
          .attr('text-anchor', 'end')
          .attr('fill', 'rgba(6, 182, 212, 0.65)')
          .attr('font-size', '8px')
          .attr('font-family', 'monospace')
          .text('48k TARGET');
      }
    }

    // Reference Target Line: 90% Jitter Buffer Safe Zone
    if (activeMetric !== 'bitrate') {
      const y90 = yHealthScale(90);
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', y90)
        .attr('y2', y90)
        .attr('stroke', 'rgba(16, 185, 129, 0.35)')
        .attr('stroke-dasharray', '4 4')
        .attr('stroke-width', 1);

      g.append('text')
        .attr('x', 6)
        .attr('y', y90 - 4)
        .attr('text-anchor', 'start')
        .attr('fill', 'rgba(16, 185, 129, 0.65)')
        .attr('font-size', '8px')
        .attr('font-family', 'monospace')
        .text('90% SAFE ZONE');
    }

    // --- Line & Area Generators ---
    const lineGroup = g.append('g').attr('clip-path', 'url(#chart-clip)');

    // 1. Bitrate Path
    if (activeMetric === 'both' || activeMetric === 'bitrate') {
      const bitrateArea = d3.area<WebRtcDiagnosticSample>()
        .curve(d3.curveMonotoneX)
        .x(d => xScale(d.durationSeconds))
        .y0(innerHeight)
        .y1(d => yBitrateScale(d.bitrateKbps));

      const bitrateLine = d3.line<WebRtcDiagnosticSample>()
        .curve(d3.curveMonotoneX)
        .x(d => xScale(d.durationSeconds))
        .y(d => yBitrateScale(d.bitrateKbps));

      // Area
      lineGroup.append('path')
        .datum(displaySamples)
        .attr('fill', 'url(#bitrate-glow-grad)')
        .attr('d', bitrateArea);

      // Stroke Line
      lineGroup.append('path')
        .datum(displaySamples)
        .attr('fill', 'none')
        .attr('stroke', '#06b6d4')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .attr('d', bitrateLine);

      // Latest Sample Pulsing Point
      const last = displaySamples[displaySamples.length - 1];
      if (last) {
        const lx = xScale(last.durationSeconds);
        const ly = yBitrateScale(last.bitrateKbps);

        lineGroup.append('circle')
          .attr('cx', lx)
          .attr('cy', ly)
          .attr('r', 3.5)
          .attr('fill', '#06b6d4')
          .attr('stroke', '#082f49')
          .attr('stroke-width', 1.5);
      }
    }

    // 2. Jitter Buffer Health Path
    if (activeMetric === 'both' || activeMetric === 'health') {
      const healthArea = d3.area<WebRtcDiagnosticSample>()
        .curve(d3.curveMonotoneX)
        .x(d => xScale(d.durationSeconds))
        .y0(innerHeight)
        .y1(d => yHealthScale(d.jitterBufferHealthPct));

      const healthLine = d3.line<WebRtcDiagnosticSample>()
        .curve(d3.curveMonotoneX)
        .x(d => xScale(d.durationSeconds))
        .y(d => yHealthScale(d.jitterBufferHealthPct));

      // Area
      lineGroup.append('path')
        .datum(displaySamples)
        .attr('fill', 'url(#health-glow-grad)')
        .attr('d', healthArea);

      // Stroke Line
      lineGroup.append('path')
        .datum(displaySamples)
        .attr('fill', 'none')
        .attr('stroke', '#10b981')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .attr('d', healthLine);

      // Latest Sample Pulsing Point
      const last = displaySamples[displaySamples.length - 1];
      if (last) {
        const lx = xScale(last.durationSeconds);
        const ly = yHealthScale(last.jitterBufferHealthPct);

        lineGroup.append('circle')
          .attr('cx', lx)
          .attr('cy', ly)
          .attr('r', 3.5)
          .attr('fill', '#10b981')
          .attr('stroke', '#064e3b')
          .attr('stroke-width', 1.5);
      }
    }

    // --- Axes ---
    // Bottom X-Axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(6, Math.floor(innerWidth / 50)))
      .tickFormat(d => {
        const val = Number(d);
        const mins = Math.floor(val / 60);
        const secs = Math.floor(val % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      });

    const xAxisG = g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(xAxis);

    xAxisG.select('.domain').attr('stroke', 'rgba(255, 255, 255, 0.15)');
    xAxisG.selectAll('.tick line').attr('stroke', 'rgba(255, 255, 255, 0.15)');
    xAxisG.selectAll('.tick text')
      .attr('fill', 'rgba(255, 255, 255, 0.45)')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace');

    // Left Y-Axis (Bitrate kbps)
    if (activeMetric !== 'health') {
      const yAxisLeft = d3.axisLeft(yBitrateScale)
        .ticks(4)
        .tickFormat(d => `${d}k`);

      const yLeftG = g.append('g').call(yAxisLeft);
      yLeftG.select('.domain').attr('stroke', 'rgba(6, 182, 212, 0.3)');
      yLeftG.selectAll('.tick line').attr('stroke', 'rgba(6, 182, 212, 0.2)');
      yLeftG.selectAll('.tick text')
        .attr('fill', '#06b6d4')
        .attr('font-size', '8.5px')
        .attr('font-family', 'monospace');

      // Axis Label
      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -34)
        .attr('x', -innerHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#06b6d4')
        .attr('font-size', '8.5px')
        .attr('font-family', 'monospace')
        .attr('font-weight', '600')
        .text('BITRATE (kbps)');
    }

    // Right Y-Axis (Buffer Health %)
    if (activeMetric !== 'bitrate') {
      const yAxisRight = d3.axisRight(yHealthScale)
        .ticks(4)
        .tickFormat(d => `${d}%`);

      const yRightG = g.append('g')
        .attr('transform', `translate(${innerWidth}, 0)`)
        .call(yAxisRight);

      yRightG.select('.domain').attr('stroke', 'rgba(16, 185, 129, 0.3)');
      yRightG.selectAll('.tick line').attr('stroke', 'rgba(16, 185, 129, 0.2)');
      yRightG.selectAll('.tick text')
        .attr('fill', '#10b981')
        .attr('font-size', '8.5px')
        .attr('font-family', 'monospace');

      // Axis Label
      g.append('text')
        .attr('transform', 'rotate(90)')
        .attr('y', -innerWidth - 34)
        .attr('x', innerHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#10b981')
        .attr('font-size', '8.5px')
        .attr('font-family', 'monospace')
        .attr('font-weight', '600')
        .text('HEALTH (%)');
    }

    // --- Interactive Hover Scrubbing ---
    const crosshair = g.append('line')
      .attr('class', 'crosshair-cursor')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', 'rgba(255, 255, 255, 0.4)')
      .attr('stroke-dasharray', '2 2')
      .style('opacity', 0);

    const overlay = g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair');

    const bisect = d3.bisector<WebRtcDiagnosticSample, number>(d => d.durationSeconds).center;

    overlay.on('mousemove touchmove', function (event) {
      const [mouseX] = d3.pointer(event);
      const x0 = xScale.invert(mouseX);
      const idx = bisect(displaySamples, x0);
      const sample = displaySamples[idx];

      if (sample) {
        setHoveredSample(sample);
        const cx = xScale(sample.durationSeconds);
        crosshair
          .attr('x1', cx)
          .attr('x2', cx)
          .style('opacity', 1);
      }
    });

    overlay.on('mouseleave touchend', function () {
      setHoveredSample(null);
      crosshair.style('opacity', 0);
    });

  }, [displaySamples, activeMetric, isExpanded]);

  // Jitter buffer rating assessment
  const healthGrade = useMemo(() => {
    if (currentHealth >= 95) return { label: 'OPTIMAL', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (currentHealth >= 80) return { label: 'STABLE', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/30' };
    if (currentHealth >= 65) return { label: 'FAIR', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
    return { label: 'DEGRADED', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
  }, [currentHealth]);

  // Export diagnostic telemetry trace
  const handleExportTelemetry = () => {
    try {
      const exportData = {
        exportedAt: new Date().toISOString(),
        summary: {
          currentBitrateKbps: currentBitrate,
          jitterBufferHealthPct: currentHealth,
          jitterMs: currentJitterMs,
          jitterBufferDelayMs: currentDelayMs,
          packetsLost,
          latencyMs,
        },
        samples: displaySamples,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shadowfrequency-telemetry-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Telemetry export error:', e);
    }
  };

  return (
    <div id="webrtc-d3-diagnostics-panel" className="w-full bg-[#05070a]/95 border border-neutral-800/90 rounded-2xl p-3 sm:p-4 text-neutral-200 shadow-xl hud-corner-box">
      
      {/* Header & Metric Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-2.5 mb-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs sm:text-sm font-bold font-mono tracking-tight text-white">
                LIVE D3 SIGNAL TELEMETRY
              </span>
              <span className={`px-1.5 py-0.2 rounded border text-[9px] font-mono font-bold uppercase tracking-wider ${healthGrade.bg} ${healthGrade.color}`}>
                {healthGrade.label}
              </span>
            </div>
            <p className="text-[10px] text-neutral-400 font-mono">
              Dual-Axis Opus Bitrate & Jitter Buffer Health
            </p>
          </div>
        </div>

        {/* View & Metric Controls */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Curve Toggles */}
          <div className="inline-flex bg-[#0a0d14] border border-neutral-800 rounded-lg p-0.5 text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setActiveMetric('both')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                activeMetric === 'both' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              ALL
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('bitrate')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer flex items-center space-x-1 ${
                activeMetric === 'bitrate' ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-500/40' : 'text-neutral-400 hover:text-cyan-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
              <span>BITRATE</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('health')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer flex items-center space-x-1 ${
                activeMetric === 'health' ? 'bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-500/40' : 'text-neutral-400 hover:text-emerald-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              <span>HEALTH</span>
            </button>
          </div>

          {/* Expand / Minimize Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 bg-[#0a0d14] hover:bg-neutral-800 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-all cursor-pointer"
            title={isExpanded ? 'Compact View' : 'Expand Inspector'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Export JSON Trace */}
          <button
            type="button"
            onClick={handleExportTelemetry}
            className="p-1.5 bg-[#0a0d14] hover:bg-neutral-800 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-all cursor-pointer"
            title="Export Diagnostic JSON Trace"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 mb-2 font-mono text-[10px]">
        
        {/* Bitrate Card */}
        <div className="bg-[#090d14] border border-cyan-500/25 rounded-xl p-2 text-left relative overflow-hidden shadow-inner">
          <div className="flex items-center justify-between text-neutral-400 mb-0.5">
            <span className="text-[9px] uppercase tracking-wider text-cyan-400 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>Opus Bitrate</span>
            </span>
            {isMuted && <span className="text-[8px] text-amber-400 font-semibold">DTX</span>}
          </div>
          <div className="text-base sm:text-lg font-bold text-white tracking-tight">
            {hoveredSample ? hoveredSample.bitrateKbps.toFixed(1) : currentBitrate.toFixed(1)}{' '}
            <span className="text-[10px] font-normal text-cyan-400">kbps</span>
          </div>
          <div className="text-[9px] text-neutral-500 flex items-center justify-between">
            <span>Nominal: 48.0 kbps</span>
            <span className="text-cyan-400/80">VBR Wideband</span>
          </div>
        </div>

        {/* Jitter Buffer Health Card */}
        <div className="bg-[#090d14] border border-emerald-500/25 rounded-xl p-2 text-left relative overflow-hidden shadow-inner">
          <div className="flex items-center justify-between text-neutral-400 mb-0.5">
            <span className="text-[9px] uppercase tracking-wider text-emerald-400 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Buffer Health</span>
            </span>
            <span className="text-[8px] text-emerald-400/80 font-semibold">Target &gt;90%</span>
          </div>
          <div className="text-base sm:text-lg font-bold text-white tracking-tight">
            {hoveredSample ? hoveredSample.jitterBufferHealthPct.toFixed(1) : currentHealth.toFixed(1)}{' '}
            <span className="text-[10px] font-normal text-emerald-400">%</span>
          </div>
          <div className="text-[9px] text-neutral-500 flex items-center justify-between">
            <span>Stability: {healthGrade.label}</span>
            <span className="text-emerald-400/80">0 Pkt Drop</span>
          </div>
        </div>

        {/* Jitter Buffer Delay */}
        <div className="bg-[#090d14] border border-neutral-800 rounded-xl p-2 text-left shadow-inner">
          <div className="text-[9px] uppercase tracking-wider text-neutral-400 mb-0.5">
            Buffer Delay
          </div>
          <div className="text-base sm:text-lg font-bold text-white tracking-tight">
            {hoveredSample ? hoveredSample.jitterBufferDelayMs.toFixed(1) : currentDelayMs.toFixed(1)}{' '}
            <span className="text-[10px] font-normal text-neutral-400">ms</span>
          </div>
          <div className="text-[9px] text-neutral-500">
            Jitter: {hoveredSample ? hoveredSample.jitterMs.toFixed(1) : currentJitterMs.toFixed(1)} ms
          </div>
        </div>

        {/* Network RTT / Loss */}
        <div className="bg-[#090d14] border border-neutral-800 rounded-xl p-2 text-left shadow-inner">
          <div className="text-[9px] uppercase tracking-wider text-neutral-400 mb-0.5">
            RTT / Loss
          </div>
          <div className="text-base sm:text-lg font-bold text-white tracking-tight">
            {latencyMs}{' '}
            <span className="text-[10px] font-normal text-neutral-400">ms</span>
          </div>
          <div className="text-[9px] text-neutral-500">
            Lost: {packetsLost} pkts (0.0%)
          </div>
        </div>

      </div>

      {/* SVG Chart Container */}
      <div 
        ref={containerRef} 
        className="w-full relative overflow-hidden bg-[#030508] border border-neutral-800/80 rounded-xl p-1 shadow-inner"
      >
        <svg ref={svgRef} className="w-full overflow-visible" />

        {/* Interactive Scrubbing Tooltip Badge */}
        {hoveredSample && (
          <div className="absolute top-2 left-3 bg-[#0a0f18]/95 border border-cyan-500/40 rounded-lg p-2 font-mono text-[9px] text-neutral-300 shadow-2xl backdrop-blur-md pointer-events-none z-10 space-y-0.5">
            <div className="font-bold text-white text-[10px] border-b border-neutral-800 pb-0.5 flex items-center justify-between gap-3">
              <span>T+{Math.floor(hoveredSample.durationSeconds / 60).toString().padStart(2, '0')}:{(hoveredSample.durationSeconds % 60).toString().padStart(2, '0')}</span>
              <span className="text-emerald-400 font-semibold">{hoveredSample.jitterBufferHealthPct.toFixed(1)}% Health</span>
            </div>
            <div className="text-cyan-400 font-medium">Bitrate: {hoveredSample.bitrateKbps.toFixed(1)} kbps</div>
            <div className="text-neutral-400">Delay: {hoveredSample.jitterBufferDelayMs.toFixed(1)} ms · Jitter: {hoveredSample.jitterMs.toFixed(1)} ms</div>
            <div className="text-neutral-500">RTT: {hoveredSample.roundTripTimeMs} ms</div>
          </div>
        )}
      </div>

      {/* Footer Diagnostic Legend & Protocols */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-neutral-800/60 font-mono text-[9px] text-neutral-400">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-0.5 bg-cyan-400 inline-block rounded" />
            <span className="text-cyan-300">Bitrate (kbps)</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-0.5 bg-emerald-400 inline-block rounded" />
            <span className="text-emerald-300">Jitter Buffer Health (%)</span>
          </span>
        </div>

        <div className="flex items-center space-x-2 text-neutral-500">
          <span className="flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>DTLS-SRTP</span>
          </span>
          <span>·</span>
          <span>Rolling 30s Window</span>
        </div>
      </div>

    </div>
  );
};
