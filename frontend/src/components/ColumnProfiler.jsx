export default function ColumnProfiler({ columns = [] }) {
  if (!columns.length) {
    return (
      <section className="data-panel">
        <h2>Colunas detectadas</h2>
        <p className="muted">A estrutura da planilha aparecera aqui apos o upload.</p>
      </section>
    );
  }

  return (
    <section className="data-panel">
      <h2>Colunas detectadas</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Coluna</th>
              <th>Tipo</th>
              <th>Vazios</th>
              <th>Unicos</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.name}>
                <td>{column.name}</td>
                <td><span className="type-pill">{column.type}</span></td>
                <td>{column.missing_count}</td>
                <td>{column.unique_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
