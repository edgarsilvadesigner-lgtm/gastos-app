const EXPENSE_CATEGORIES = [
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

const INCOME_CATEGORIES = [
  { id: 'salario', label: 'Salário', color: '#3b6fd6' },
  { id: 'presente_recebido', label: 'Presente', color: '#8fae8b' },
  { id: 'juros', label: 'Juros', color: '#4fae4f' },
  { id: 'reembolso', label: 'Reembolso', color: '#4fd1c5' },
  { id: 'outros_rendimentos', label: 'Outros', color: '#e05a5a' },
];

const EXPENSE_CATEGORY_IDS = new Set(EXPENSE_CATEGORIES.map((c) => c.id));
const INCOME_CATEGORY_IDS = new Set(INCOME_CATEGORIES.map((c) => c.id));

function categoriesForType(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

function categoryIdsForType(type) {
  return type === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS;
}

module.exports = { EXPENSE_CATEGORIES, INCOME_CATEGORIES, categoriesForType, categoryIdsForType };
