import { createServer } from 'node:http';
 
const servidor = createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8'
  });
  res.end('<h1>Olá, turma!</h1>');
});
servidor.listen(3000);