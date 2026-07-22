import Plot from "react-plotly.js";
import { Maximize2 } from "lucide-react";
import { useRef } from "react";

export default function ChartRenderer({ chart }) {
  const panelRef = useRef(null);
  const data = buildData(chart);
  const layout = {
    autosize: true,
    margin: { l: 46, r: 22, t: 16, b: 42 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      family: "Inter, system-ui, sans-serif",
      size: 12,
      color: getComputedStyle(document.documentElement).getPropertyValue("--text").trim(),
    },
    xaxis: {
      title: chart.xLabel || "",
      gridcolor: getComputedStyle(document.documentElement).getPropertyValue("--grid").trim(),
      zerolinecolor: getComputedStyle(document.documentElement).getPropertyValue("--grid").trim(),
    },
    yaxis: {
      title: chart.yLabel || "",
      gridcolor: getComputedStyle(document.documentElement).getPropertyValue("--grid").trim(),
      zerolinecolor: getComputedStyle(document.documentElement).getPropertyValue("--grid").trim(),
    },
    showlegend: chart.type === "pie",
  };

  return (
    <article className="chart-panel" ref={panelRef}>
      <header>
        <h3>{chart.title}</h3>
        <button
          className="icon-button compact"
          title="Tela cheia"
          onClick={() => panelRef.current?.requestFullscreen?.()}
        >
          <Maximize2 size={15} />
        </button>
      </header>
      <div className="chart-canvas">
        <Plot
          data={data}
          layout={layout}
          config={{
            displayModeBar: true,
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: ["lasso2d", "select2d"],
            toImageButtonOptions: {
              format: "png",
              filename: chart.title || "smartreports-chart",
              height: 720,
              width: 1080,
              scale: 2,
            },
          }}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </article>
  );
}

function buildData(chart) {
  const color = "#1f6f78";
  if (chart.type === "line") {
    return [{ type: "scatter", mode: "lines+markers", x: chart.x, y: chart.y, line: { color } }];
  }
  if (chart.type === "bar") {
    return [{ type: "bar", x: chart.x, y: chart.y, marker: { color: "#3b8c6e" } }];
  }
  if (chart.type === "pie") {
    return [{ type: "pie", labels: chart.labels, values: chart.values, hole: 0.52 }];
  }
  if (chart.type === "scatter") {
    return [
      {
        type: "scatter",
        mode: "markers",
        x: chart.x,
        y: chart.y,
        marker: { color: "#d97706", size: 7, opacity: 0.78 },
      },
    ];
  }
  return [{ type: "histogram", x: chart.x, marker: { color: "#6958a8" } }];
}
