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

// Modelo
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
  const apiKey = process.env.OPENAI_API_KEY;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const data = {
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  };

  let tentativa = 0;
  while (tentativa < 5) {
    try {
      const res = await axios.post('https://api.openai.com/v1/chat/completions', data, { headers });
      return res.data.choices[0].message.content;
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`⚠️ Rate limit atingido, tentando de novo em 2000ms...`);
        await new Promise(r => setTimeout(r, 2000));
        tentativa++;
      } else {
        throw err;
      }
    }
  }
  throw new Error("Máximo de tentativas atingido por erro 429");
};

// Gera resumo + questões
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

    const resultado = new Resultado({ aluno: null, tema, resumo, perguntas });
    await resultado.save();
    res.json({ id: resultado._id, resumo, perguntas });
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(500).json({ erro: 'Erro ao gerar conteúdo' });
  }
});

// Submete respostas
app.post('/teste', async (req, res) => {
  const { aluno, questaoId, respostas } = req.body;
  if (!aluno || !questaoId || !respostas)
    return res.status(400).json({ erro: 'Campos obrigatórios ausentes' });

  try {
    const quiz = await Resultado.findById(questaoId);
    if (!quiz) return res.status(404).json({ erro: 'ID de questões não encontrado' });

    const corretas = quiz.perguntas;
    let acertos = 0;
    for (const resp of respostas) {
      const correta = corretas.find(q => q.numero === resp.numero);
      if (correta && correta.correta === resp.resposta) acertos++;
    }

    const novoResultado = new Resultado({
      aluno,
      tema: quiz.tema,
      resumo: quiz.resumo,
      perguntas: quiz.perguntas,
      respostas,
      pontuacao: acertos
    });
    await novoResultado.save();

    res.json({ pontuacao: acertos, total: corretas.length });
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(500).json({ erro: 'Erro ao salvar o resultado' });
  }
});

// Histórico por aluno
app.get('/historico/:aluno', async (req, res) => {
  try {
    const resultados = await Resultado.find({ aluno: req.params.aluno });
    if (resultados.length === 0)
      return res.status(404).json({ erro: 'Nenhum histórico encontrado' });

    res.json(resultados);
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(500).json({ erro: 'Erro ao consultar histórico' });
  }
});

app.listen(3000, () => {
  console.log('🚀 API rodando em http://localhost:3000');
});
