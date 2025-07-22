let allData = {};
let chartInstances = {};
let quarterClicked = "";
let darkMode = false;

const monthMap = {
  "01": { month: "Jan", quarter: "Q4" }, "02": { month: "Feb", quarter: "Q4" }, "03": { month: "Mar", quarter: "Q4" },
  "04": { month: "Apr", quarter: "Q1" }, "05": { month: "May", quarter: "Q1" }, "06": { month: "Jun", quarter: "Q1" },
  "07": { month: "Jul", quarter: "Q2" }, "08": { month: "Aug", quarter: "Q2" }, "09": { month: "Sep", quarter: "Q2" },
  "10": { month: "Oct", quarter: "Q3" }, "11": { month: "Nov", quarter: "Q3" }, "12": { month: "Dec", quarter: "Q3" }
};

const quarterToMonths = {
  Q1: ["Apr", "May", "Jun"],
  Q2: ["Jul", "Aug", "Sep"],
  Q3: ["Oct", "Nov", "Dec"],
  Q4: ["Jan", "Feb", "Mar"]
};

async function fetchData() {
  const res = await fetch("/api/dashboard-data");
  const data = await res.json();

  data.monthly_data = data.monthly_data.map(row => {
    const parts = row.month.match(/\d{2}$/);
    const mm = parts ? parts[0] : "04";
    const mapped = monthMap[mm] || { month: row.month, quarter: "Q1" };
    return { ...row, month: mapped.month, quarter: mapped.quarter };
  });

  allData = data;
  populateFilters();
  updateDashboard();
}

function getCurrentFiscalYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 4 ? year : year - 1;
}

function populateFilters() {
  const employees = [...new Set(allData.year_data.map((d) => d.employee))];
  const regions = [...new Set(allData.year_data.map((d) => d.region))];
  const quarters = [...new Set(allData.quarter_data.map((d) => d.quarter))];

  fillSelect("filterEmployee", employees);
  fillSelect("filterRegion", regions);
  fillSelect("filterQuarter", quarters);
}

function fillSelect(id, items) {
  const select = document.getElementById(id);
  const current = select.value;
  select.innerHTML =
    `<option value="">All</option>` +
    items.map((i) => `<option value="${i}">${i}</option>`).join("");
  if (items.includes(current)) select.value = current;
}

function getFilteredData() {
  const emp = document.getElementById("filterEmployee").value;
  const reg = document.getElementById("filterRegion").value;
  const qtr = quarterClicked || document.getElementById("filterQuarter").value;

  const yearFiltered = allData.year_data.filter(
    (d) => (!emp || d.employee === emp) && (!reg || d.region === reg)
  );

  const quarterFiltered = allData.quarter_data.filter(
    (d) => (!emp || d.employee === emp) &&
           (!reg || d.region === reg) &&
           (!qtr || d.quarter === qtr)
  );

  const allowedMonths = quarterToMonths[qtr || "Q1"];
  const monthFiltered = allData.monthly_data.filter(
    (d) => (!emp || d.employee === emp) &&
           (!reg || d.region === reg) &&
           (!qtr || allowedMonths.includes(d.month))
  );

  return { yearFiltered, quarterFiltered, monthFiltered, quarter: qtr };
}

function updateDashboard() {
  const { yearFiltered, quarterFiltered, monthFiltered, quarter } = getFilteredData();
  updateQuarterlyChart(quarterFiltered, quarter);
  updateRegionChart(quarterFiltered);
  updateMonthlyPie(monthFiltered, quarter);
  updateAnnualLine(yearFiltered);
  updateCards(yearFiltered);
}

function resetDashboard() {
  quarterClicked = "";
  document.querySelectorAll("select").forEach((s) => (s.value = ""));
  fetchData();
}

function toggleDarkMode() {
  darkMode = !darkMode;
  document.body.classList.toggle("dark-mode", darkMode);
  updateDashboard();
}

function formatMillions(value) {
  return `$${(value / 1_000_000).toFixed(1)} M`;
}

// -------- CHARTS --------

function updateQuarterlyChart(data, activeQuarter) {
  const fy = getCurrentFiscalYear();
  const titleElement = document.getElementById("quarterlyTitle");
  if (titleElement) titleElement.textContent = `Quarterly Forecast FY ${fy}`;

  const ctx = document.getElementById("quarterlyBarChart").getContext("2d");
  const grouped = groupBy(data, "quarter", "predicted_value");
  const labels = Object.keys(grouped);
  const values = Object.values(grouped);
  const bgColors = labels.map(q => q === activeQuarter ? "#f28e2c" : "#4e79a7");

  if (chartInstances.quarterlyBarChart) {
    chartInstances.quarterlyBarChart.destroy();
  }

  chartInstances.quarterlyBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Quarterly Forecast",
        data: values,
        backgroundColor: bgColors
      }]
    },
    options: {
      responsive: true,
      onClick: (e, el) => {
        if (el.length) {
          const clickedQuarter = el[0].element.$context.label;
          quarterClicked = clickedQuarter === quarterClicked ? "" : clickedQuarter;
          updateDashboard();
        }
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: "end",
          align: "top",
          color: darkMode ? "#fff" : "#000",
          formatter: formatMillions
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: darkMode ? "#fff" : "#000" }
        },
        y: {
          grid: { display: false },
          ticks: { display: false },
          suggestedMax: Math.max(...values) * 1.2
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

function updateRegionChart(data) {
  const ctx = document.getElementById("regionBarChart").getContext("2d");
  const grouped = groupBy(data, "region", "predicted_value");
  renderChart(ctx, grouped, "Forecast by Region", "bar", "regionBarChart");
}

function updateMonthlyPie(data, quarter) {
  const ctx = document.getElementById("monthlyPieChart").getContext("2d");

  const fallbackQuarter = quarter || "Q1";
  const allowedMonths = quarterToMonths[fallbackQuarter] || [];

  const grouped = groupBy(data, "month", "predicted_value");
  const filteredGrouped = Object.keys(grouped)
    .filter(month => allowedMonths.includes(month))
    .reduce((acc, month) => {
      acc[month] = grouped[month];
      return acc;
    }, {});

  const pieLabels = Object.keys(filteredGrouped);
  const pieData = Object.values(filteredGrouped);

  if (chartInstances.monthlyPieChart) chartInstances.monthlyPieChart.destroy();

  chartInstances.monthlyPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: pieLabels.length ? pieLabels : ["No Data"],
      datasets: [{
        data: pieData.length ? pieData : [1],
        backgroundColor: ["#4BC0C0", "#36A2EB", "#FFCE56", "#FF6384", "#9966FF", "#FF9F40"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: darkMode ? "#fff" : "#000",
            font: { size: 12 }
          }
        },
        datalabels: {
          display: pieLabels.length > 0,
          color: "#fff",
          formatter: v => `$${(v / 1e6).toFixed(1)}M`,
          font: { weight: "bold", size: 10 }
        }
      }
    },
    plugins: [ChartDataLabels]
  });

  document.getElementById("pieTitle").textContent = `Monthly Breakdown (${fallbackQuarter})`;
}

function updateAnnualLine(data) {
  const ctx = document.getElementById("annualLineChart").getContext("2d");

  if (chartInstances.annualLineChart) {
    chartInstances.annualLineChart.destroy();
  }

  const grouped = groupBy(data, "employee", "predicted_value");
  const labels = Object.keys(grouped);
  const values = Object.values(grouped);

  const colors = [
    "#4e79a7", "#f28e2c", "#e15759", "#76b7b2",
    "#59a14f", "#edc949", "#af7aa1", "#ff9da7",
    "#9c755f", "#bab0ab"
  ];
  const backgroundColors = labels.map((_, i) => colors[i % colors.length]);

  chartInstances.annualLineChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Annual Forecast",
        data: values,
        backgroundColor: backgroundColors,
        maxBarThickness: 60,           
        categoryPercentage: 0.6,      
        barPercentage: 0.8             
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,       
      aspectRatio: 2.5,                
      layout: {
        padding: { top: 30, bottom: 10 }
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#000',
          font: { weight: 'bold' },
          formatter: value => `$${(value / 1_000_000).toFixed(1)} M`,
          clamp: true,
          clip: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#000' }
        },
        y: {
          beginAtZero: true,
          grid: { display: false },
          ticks: { display: false },
          suggestedMax: Math.max(...values) * 1.2
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}


function updateCards(data) {
  const total = data.reduce((sum, d) => sum + (d.predicted_value || 0), 0);
  const top = data.length ? data.reduce((a, b) => (a.predicted_value > b.predicted_value ? a : b)) : { employee: "N/A", predicted_value: 0 };

  document.getElementById("topForecast").innerText = formatMillions(total);
  document.getElementById("topPerformer").innerText = top.employee;
}

function groupBy(data, key, metric) {
  return data.reduce((acc, curr) => {
    acc[curr[key]] = (acc[curr[key]] || 0) + parseFloat(curr[metric]);
    return acc;
  }, {});
}

function renderChart(ctx, dataObj, label, type, id) {
  if (chartInstances[id]) chartInstances[id].destroy();

  const labels = Object.keys(dataObj);
  const values = Object.values(dataObj);
  const colorPalette = [
    "#4e79a7", "#f28e2c", "#e15759", "#76b7b2",
    "#59a14f", "#edc949", "#af7aa1", "#ff9da7"
  ];

  chartInstances[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        backgroundColor: type === "doughnut" ? colorPalette : colorPalette.slice(0, values.length),
        borderColor: "#ccc",
        ...(type === "bar" && {
          fill: true,
          tension: 0.4
        })
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          color: darkMode ? "#fff" : "#000",
          formatter: formatMillions,
          anchor: "end",
          align: "top"
        }
      },
      scales: type !== "doughnut" ? {
        x: {
          grid: { display: false },
          ticks: { color: darkMode ? "#fff" : "#000" }
        },
        y: {
          grid: { display: false },
          ticks: { display: false },
          suggestedMax: Math.max(...values) * 1.2
        }
      } : {},
      cutout: type === "doughnut" ? "60%" : undefined
    },
    plugins: [ChartDataLabels]
  });
}

document.addEventListener("DOMContentLoaded", () => {
  fetchData();
  document.querySelectorAll("select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      if (e.target.id === "filterQuarter") quarterClicked = "";
      updateDashboard();
    });
  });
  document.getElementById("resetBtn").addEventListener("click", resetDashboard);
  document.getElementById("darkToggle").addEventListener("click", toggleDarkMode);
});
