export const contractClauses = [
  {
    title: 'CLÁUSULA 1ª – DO OBJETO',
    body: 'A LOCADORA disponibilizará ao LOCATÁRIO os brinquedos, equipamentos e serviços descritos neste contrato, para utilização no evento e durante o período aqui indicados. Os itens, quantidades e valores constam no quadro de itens e na identificação da locação.',
  },
  {
    title: 'CLÁUSULA 2ª – DA DATA E DO LOCAL DO EVENTO',
    body: 'A locação observará a data, os horários e o endereço informados neste instrumento. Qualquer alteração de data, horário ou local deverá ser comunicada previamente à LOCADORA e dependerá de confirmação entre as partes.',
  },
  {
    title: 'CLÁUSULA 3ª – DO VALOR E DA FORMA DE PAGAMENTO',
    body: 'O valor total e a composição do preço estão discriminados neste contrato. Eventual sinal, entrada, saldo, vencimentos e meios de pagamento deverão corresponder aos valores registrados na locação ou ao que as partes ajustarem por escrito. A reserva da data será considerada confirmada conforme a condição de pagamento previamente acordada entre as partes.',
  },
  {
    title: 'CLÁUSULA 4ª – DA ENTREGA, MONTAGEM E UTILIZAÇÃO',
    body: 'A LOCADORA realizará a entrega, montagem e retirada dos equipamentos quando esses serviços fizerem parte da locação, observando os horários combinados. O LOCATÁRIO deverá disponibilizar espaço adequado, nivelado e seguro para a instalação e informar previamente restrições de acesso, escadas, cobertura, tomadas ou outras condições relevantes. Os equipamentos deverão ser utilizados conforme as orientações de segurança fornecidas pela LOCADORA. Equipamentos que exijam operação específica deverão ser manuseados somente por pessoa orientada e autorizada, e brinquedos deverão contar com supervisão adequada de um adulto responsável.',
  },
  {
    title: 'CLÁUSULA 5ª – DAS RESPONSABILIDADES DAS PARTES',
    body: 'A LOCADORA deverá disponibilizar os itens em condições adequadas de uso e prestar as orientações necessárias à utilização segura. O LOCATÁRIO compromete-se a zelar pelos equipamentos e comunicar imediatamente qualquer falha, acidente ou dano. Danos decorrentes de uso inadequado ou do descumprimento comprovado das orientações poderão ser apurados e cobrados mediante demonstração dos prejuízos efetivamente causados, respeitada a legislação aplicável. Não será atribuída ao LOCATÁRIO responsabilidade por desgaste natural ou defeito não causado por sua conduta.',
  },
  {
    title: 'CLÁUSULA 6ª – DO CANCELAMENTO E DA ALTERAÇÃO DA DATA',
    body: 'Pedidos de cancelamento ou alteração deverão ser comunicados à LOCADORA assim que possível. As partes buscarão uma solução de comum acordo, considerando a antecedência do aviso, os custos efetivamente realizados e a possibilidade de remarcação. Eventual retenção ou devolução de valores deverá respeitar a legislação aplicável e os direitos do consumidor.',
  },
  {
    title: 'CLÁUSULA 7ª – DAS DISPOSIÇÕES GERAIS',
    body: 'Qualquer alteração das condições deste contrato deverá ser acordada entre as partes, preferencialmente por escrito. Este instrumento registra as condições da locação e, juntamente com os dados e itens nele descritos, passa a produzir efeitos após a aceitação das partes.',
  },
  {
    title: 'CLÁUSULA 8ª – DA ASSINATURA',
    body: 'As partes poderão assinar este instrumento de forma física ou eletrônica, desde que seja possível identificar os signatários e preservar a integridade do documento. Cada parte deverá ter acesso a uma cópia do contrato assinado.',
  },
] as const;

export function contractDate(value?: string | null) {
  if (!value) return 'Não informado';
  const date = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

export function contractTime(value?: string | null) {
  return value || 'Não informado';
}
