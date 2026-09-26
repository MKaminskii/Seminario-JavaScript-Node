// src/limites.js
//
// Regras de tamanho em um lugar só. O servidor usa estes números para
// validar o que chega (server.js) e as páginas usam os mesmos números no
// maxlength dos campos (src/paginas.js). Assim os dois nunca discordam.

export const LIMITES = {
  nome: 30, // caracteres no nome de usuário
  senhaMinima: 4, // didático, para a demonstração; num sistema real, peça bem mais
  recado: 500, // caracteres por recado
};
