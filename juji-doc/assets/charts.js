(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim() || '#f97316';
  var accent2 = style.getPropertyValue('--accent2').trim() || '#27c07d';
  var ink = style.getPropertyValue('--ink').trim() || '#2d2625';
  var muted = style.getPropertyValue('--muted').trim() || '#8a7a77';
  var rule = style.getPropertyValue('--rule').trim() || '#f0e4df';
  var bg2 = style.getPropertyValue('--bg2').trim() || '#ffffff';

  var palette = [accent, accent2, '#60a5fa', '#a78bfa', '#fb923c', '#38bdf8', '#f472b6', '#fbbf24'];

  // ===== Chart 1: Version Timeline =====
  var el1 = document.getElementById('chart-versions');
  if (el1) {
    var chart1 = echarts.init(el1, null, { renderer: 'svg' });
    var versions = ['v1.0.0', 'v1.0.1', 'v1.0.6', 'v1.0.7', 'v1.0.8', 'v1.1.0', 'v1.1.2', 'v1.1.4', 'v1.1.6'];
    var dates = ['05-24', '05-26', '05-31', '06-06', '06-11', '06-11', '06-12', '07-30', '08-03'];
    var impact = [3, 2, 4, 2, 5, 3, 4, 5, 4];
    var labels = [
      '首次部署', '编辑账单', '数据迁移', '退出登录',
      'AI 聊天', '对话记账', '账单查询', '架构优化', '隐私规范'
    ];

    chart1.setOption({
      animation: false,
      tooltip: {
        appendToBody: true,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: rule,
        textStyle: { color: ink, fontSize: 13 },
        formatter: function(p) {
          return '<strong>' + p.name + '</strong><br/>' +
            dates[p.dataIndex] + ' · ' + labels[p.dataIndex] + '<br/>' +
            '功能影响度: ' + p.value + '/5';
        }
      },
      grid: { left: 50, right: 30, top: 30, bottom: 50 },
      xAxis: {
        type: 'category',
        data: versions,
        axisLine: { lineStyle: { color: rule } },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 11, rotate: 30 }
      },
      yAxis: {
        type: 'value',
        name: '功能影响度',
        nameTextStyle: { color: muted, fontSize: 11 },
        min: 0, max: 6,
        splitLine: { lineStyle: { color: rule, type: 'dashed' } },
        axisLabel: { color: muted, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        data: impact.map(function(v, i) {
          return {
            value: v,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: i % 2 === 0 ? accent : accent2 },
                { offset: 1, color: i % 2 === 0 ? '#fb923c' : '#38bdf8' }
              ]),
              borderRadius: [6, 6, 0, 0]
            }
          };
        }),
        barWidth: '50%',
        label: {
          show: true,
          position: 'top',
          formatter: function(p) { return labels[p.dataIndex]; },
          fontSize: 10,
          color: muted,
          rotate: 25,
          offset: [0, 4]
        }
      }]
    });
    window.addEventListener('resize', function() { chart1.resize(); });
  }

  // ===== Chart 2: Module Distribution =====
  var el2 = document.getElementById('chart-modules');
  if (el2) {
    var chart2 = echarts.init(el2, null, { renderer: 'svg' });
    chart2.setOption({
      animation: false,
      tooltip: {
        appendToBody: true,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: rule,
        textStyle: { color: ink, fontSize: 13 },
        formatter: '{b}: {c} 个文件 ({d}%)'
      },
      legend: {
        orient: 'vertical',
        right: 20,
        top: 'center',
        textStyle: { color: ink, fontSize: 13 },
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 12
      },
      series: [{
        type: 'pie',
        radius: ['42%', '70%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: bg2,
          borderWidth: 3
        },
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            color: ink
          }
        },
        data: [
          { value: 40, name: '前端页面 (WXML/WXSS/JS/JSON)', itemStyle: { color: accent } },
          { value: 27, name: '云函数 (Node.js)', itemStyle: { color: accent2 } },
          { value: 9, name: '工具模块 (utils)', itemStyle: { color: '#60a5fa' } },
          { value: 16, name: 'SVG 图标资源', itemStyle: { color: '#a78bfa' } },
          { value: 4, name: '自定义组件', itemStyle: { color: '#fb923c' } },
          { value: 8, name: 'TabBar 与全局资源', itemStyle: { color: '#38bdf8' } }
        ]
      }]
    });
    window.addEventListener('resize', function() { chart2.resize(); });
  }

  // ===== Chart 3: Cloud Function Radar =====
  var el3 = document.getElementById('chart-cloud');
  if (el3) {
    var chart3 = echarts.init(el3, null, { renderer: 'svg' });
    chart3.setOption({
      animation: false,
      tooltip: {
        appendToBody: true,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: rule,
        textStyle: { color: ink, fontSize: 13 }
      },
      legend: {
        data: ['核心业务', 'AI 能力', '数据运维'],
        bottom: 0,
        textStyle: { color: ink, fontSize: 12 },
        itemWidth: 14,
        itemHeight: 8
      },
      radar: {
        indicator: [
          { name: '数据校验', max: 5 },
          { name: 'AI 调用', max: 5 },
          { name: '数据库操作', max: 5 },
          { name: '云存储', max: 5 },
          { name: '内容安全', max: 5 },
          { name: '用户隔离', max: 5 }
        ],
        shape: 'polygon',
        center: ['50%', '48%'],
        radius: '62%',
        axisName: { color: muted, fontSize: 12 },
        splitLine: { lineStyle: { color: rule } },
        splitArea: { areaStyle: { color: ['rgba(249,115,22,0.02)', 'rgba(39,192,125,0.02)'] } },
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'radar',
        data: [
          {
            value: [5, 0, 5, 1, 2, 5],
            name: '核心业务',
            lineStyle: { color: accent, width: 2 },
            areaStyle: { color: 'rgba(249,115,22,0.15)' },
            itemStyle: { color: accent }
          },
          {
            value: [2, 5, 4, 0, 5, 5],
            name: 'AI 能力',
            lineStyle: { color: accent2, width: 2 },
            areaStyle: { color: 'rgba(39,192,125,0.15)' },
            itemStyle: { color: accent2 }
          },
          {
            value: [3, 0, 5, 5, 1, 5],
            name: '数据运维',
            lineStyle: { color: '#60a5fa', width: 2 },
            areaStyle: { color: 'rgba(96,165,250,0.12)' },
            itemStyle: { color: '#60a5fa' }
          }
        ]
      }]
    });
    window.addEventListener('resize', function() { chart3.resize(); });
  }
})();
