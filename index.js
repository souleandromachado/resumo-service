const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const mongoURI = process.env.MONGODB_URI;
const useDummy = process.env.USE_DUMMY === 'true';
const openaiKey = process.env.OPENAI_API_KEY;

const questoesCache = {};

// Conectar MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

// Schema
const respostaSchema = new mongoose.Schema({
  aluno: String,
  tema: String,
  questaoId: String,
  respostas: [{
    numero: Number,
    resposta: String,
    correta: String,
    acertou: Boolean
  }],
  pontuacao: Number,
  data: { type: Date, default: Date.now }
});
const Resposta = mongoose.model('Resposta', respostaSchema);

// Dummy Generator
function gerarConteudoDummy(tema) {
  const resumo = `Este é um resumo simplificado sobre o tema "${tema}".`;
  const questoes = Array.from({ length: 5 }).map((_, i) => ({
    pergunta: `Pergunta ${i + 1} sobre o tema "${tema}"`,
    alternativas: { A: "Alternativa A", B: "Alternativa B", C: "Alternativa C", D: "Alternativa D" },
    correta: ["A", "B", "C", "D"][i % 4]
  }));
  return { resumo, questoes };
}

// Função para chamar o ChatGPT com retry para erro 429
async function gerarConteudoReal(tema, tentativas = 5, delay = 2000) {
  const prompt = `
Resuma brevemente o tema "${tema}" e crie 5 questões de múltipla escolha com 4 alternativas cada (A, B, C, D) e indique a alternativa correta. Retorne no formato JSON:
{
  "resumo": "...",
  "questoes": [
    {
      "pergunta": "...",
      "alternativas": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correta": "A"
    }, ...
  ]
}
`.trim();

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      const json = JSON.parse(content);
      return json;

    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`⚠️ Rate limit atingido, tentativa ${tentativa}/${tentativas}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (err.response?.status === 401) {
        throw new Error('❌ Chave da OpenAI inválida (401)');
      } else {
        throw err;
      }
    }
  }

  throw new Error('❌ Máximo de tentativas atingido por erro 429');
}

// POST /resumo
app.post('/resumo', async (req, res) => {
  const { tema } = req.body;
  if (!tema) return res.status(400).json({ erro: 'Tema é obrigatório' });

  try {
    let resumo, questoes;

    if (useDummy) {
      console.log('⚙️  Modo dummy ativado');
      ({ resumo, questoes } = gerarConteudoDummy(tema));
    } else {
      const resultado = await gerarConteudoReal(tema);
      resumo = resultado.resumo;
      questoes = resultado.questoes;
    }

    const id = Math.random().toString(36).substring(2, 10);
    questoesCache[id] = { tema, questoes };

    res.json({
      id,
      resumo,
      questoes: questoes.map((q, i) => ({
        numero: i + 1,
        pergunta: q.pergunta,
        alternativas: q.alternativas
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar conteúdo' });
  }
});

// POST /teste
app.post('/teste', async (req, res) => {
  const { aluno, questaoId, respostas } = req.body;
  if (!aluno || !questaoId || !Array.isArray(respostas)) {
    return res.status(400).json({ erro: 'Campos obrigatórios: aluno, questaoId, respostas[]' });
  }

  const registro = questoesCache[questaoId];
  if (!registro) return res.status(404).json({ erro: 'ID de questões não encontrado' });

  const { questoes, tema } = registro;

  let acertos = 0;
  const avaliacoes = respostas.map(r => {
    const q = questoes[r.numero - 1];
    const correta = q.correta.toUpperCase();
    const respostaUser = (r.resposta || '').toUpperCase();
    const acertou = respostaUser === correta;
    if (acertou) acertos++;
    return { numero: r.numero, resposta: respostaUser, correta, acertou };
  });

  try {
    const respostaAluno = new Resposta({
      aluno,
      tema,
      questaoId,
      respostas: avaliacoes,
      pontuacao: acertos
    });

    await respostaAluno.save();

    res.json({
      aluno,
      tema,
      pontuacao: acertos,
      total: questoes.length,
      respostas: avaliacoes
    });
  } catch (err) {
    console.error('Erro ao salvar no MongoDB:', err);
    res.status(500).json({ erro: 'Erro ao salvar o resultado no banco de dados' });
  }
});

// GET /historico/:aluno
app.get('/historico/:aluno', async (req, res) => {
  const { aluno } = req.params;
  try {
    const historico = await Resposta.find({ aluno }).sort({ data: -1 });
    if (!historico.length) {
      return res.status(404).json({ mensagem: 'Nenhum histórico encontrado para este aluno' });
    }

    const retorno = historico.map(r => ({
      tema: r.tema,
      data: r.data,
      pontuacao: r.pontuacao,
      total: r.respostas.length,
      respostas: r.respostas
    }));

    res.json({ aluno, historico: retorno });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao consultar histórico' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
  if (useDummy) {
    console.log('⚙️  Modo dummy ativado');
  }
});
