const CATEGORIES = [
  { id: 'saude', label: 'Saúde', color: '#e5484d' },
  { id: 'lazer', label: 'Lazer', color: '#6fae7c' },
  { id: 'casa', label: 'Casa', color: '#3b6fd6' },
  { id: 'cafe', label: 'Café', color: '#e8b93f' },
  { id: 'educacao', label: 'Educação', color: '#d1447a' },
  { id: 'presentes', label: 'Presentes', color: '#8fae8b' },
  { id: 'compras_mercado', label: 'Compras de mercado', color: '#7ec6e8' },
  { id: 'familia', label: 'Família', color: '#d64545' },
  { id: 'exercicio', label: 'Exercício físico', color: '#5cb85c' },
  { id: 'transporte', label: 'Transporte', color: '#3b6fd6' },
  { id: 'outros', label: 'Outros', color: '#e05a5a' },
  { id: 'renda_casa', label: 'Renda casa', color: '#c94f4f' },
  { id: 'gasolina_mota', label: 'Gasolina mota', color: '#5a9e5a' },
  { id: 'restaurantes', label: 'Restaurantes', color: '#d1447a' },
  { id: 'ginasio', label: 'Ginásio', color: '#4fae4f' },
  { id: 'poupanca', label: 'Conta poupança', color: '#8b6bb5' },
  { id: 'agua', label: 'Água', color: '#4fd1c5' },
  { id: 'roupa', label: 'Roupa', color: '#a8c8a0' },
  { id: 'consumiveis', label: 'Consumíveis para jantar', color: '#8b6bb5' },
  { id: 'gasoleo_carrinha', label: 'Gasóleo carrinha', color: '#3b6fd6' },
  { id: 'luz', label: 'Luz', color: '#5cb85c' },
];

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

module.exports = { CATEGORIES, CATEGORY_IDS };
