require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const app = express();

app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true, useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

// Modelo Resultado (teste)
const ResultadoSchema = new mongoose.Schema({
  aluno: String,
  tema: String,
  resumo: String,
  perguntas: Array,
  respostas: Array,
  pontuacao: Number,
  criadoEm: { type: Date, default: Date.now }
});
const Resultado = mongoose.model('Resultado', ResultadoSchema);

// Modelo Resumo
const ResumoSchema = new mongoose.Schema({
  tema: String,
  resumo: String,
  perguntas: Array,
  criadoEm: { type: Date, default: Date.now }
});
const Resumo = mongoose.model('Resumo', ResumoSchema);

// Dummy
const dummyResumo = "Resumo sobre o tema solicitado.";
const dummyQuestoes = [
  { numero: 1, pergunta: "Pergunta 1?", opcoes: ["A", "B", "C", "D"], correta: "A" },
  { numero: 2, pergunta: "Pergunta 2?", opcoes: ["A", "B", "C", "D"], correta: "B" },
  { numero: 3, pergunta: "Pergunta 3?", opcoes: ["A", "B", "C", "D"], correta: "C" },
  { numero: 4, pergunta: "Pergunta 4?", opcoes: ["A", "B", "C", "D"], correta: "D" },
  { numero: 5, pergunta: "Pergunta 5?", opcoes: ["A", "B", "C", "D"], correta: "A" }
];
const usarDummy = process.env.USE_DUMMY_DATA === 'true';

// ChatGPT com tratamento de erro 429
const chatGPT = async (prompt) => {
  // ... mesmíssimo código previamente fornecido ...
};

// Rota de geração de resumo
app.post('/resumo', async (req, res) => {
  const { tema } = req.body;
  if (!tema) return res.status(400).json({ erro: 'Tema é obrigatório' });

  try {
    let resumo, perguntas;
    if (usarDummy) {
      resumo = dummyResumo;
      perguntas = dummyQuestoes;
    } else {
      const resposta = await chatGPT(`Crie um resumo curto e 5 perguntas de múltipla escolha com respostas certas sobre: ${tema}`);
      const [r, ...qs] = resposta.split("\n").filter(Boolean);
      resumo = r;
      perguntas = qs.map((q, i) => ({
        numero: i + 1,
        pergunta: q,
        opcoes: ["A", "B", "C", "D"],
        correta: "A"
      }));
    }

    const resumoCriado = new Resumo({ tema, resumo, perguntas });
    await resumoCriado.save();

    res.json({ id: resumoCriado._id, resumo, perguntas });
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(500).json({ erro: 'Erro ao gerar conteúdo' });
  }
});

// Rotas CRUD de Resumos
app.get('/resumos', async (req, res) => {
  try {
    const resumos = await Resumo.find();
    res.json(resumos);
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(500).json({ erro: 'Erro ao listar resumos' });
  }
});

app.put('/resumos/:id', async (req, res) => {
  try {
    const { tema, resumo, perguntas } = req.body;
    const atualizado = await Resumo.findByIdAndUpdate(
      req.params.id,
      { tema, resumo, perguntas },
      { new: true }
    );
    if (!atualizado) return res.status(404).json({ erro: 'Resumo não encontrado' });
    res.json(atualizado);
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(500).json({ erro: 'Erro ao editar resumo' });
  }
});

app.delete('/resumos/:id', async (req, res) => {
  try {
    const deletado = await Resumo.findByIdAndDelete(req.params.id);
    if (!deletado) return res.status(404).json({ erro: 'Resumo não encontrado' });
    res.json({ mensagem: 'Resumo deletado com sucesso' });
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(500).json({ erro: 'Erro ao deletar resumo' });
  }
});

// Rota de submissão de teste (mantida conforme solicitado)
app.post('/teste', async (req, res) => { /* seu mesmo código aqui */ });

// Inicialização
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 API rodando na porta ${port}`));
