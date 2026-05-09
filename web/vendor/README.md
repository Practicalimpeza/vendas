# Dependencias vendorizadas do frontend

Arquivos externos mantidos localmente para o app continuar abrindo sem build step e sem depender de CDN em runtime.

- `echarts.min.js` - ECharts 5.5.1, usado nos graficos da mesa.
- `lucide.min.js` - Lucide 0.468.0, usado nos icones da interface.

Ao atualizar, baixe novas versoes minificadas e ajuste os parametros `v=` em `web/index.html`.
