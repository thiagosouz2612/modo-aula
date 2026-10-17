// ------------------------------------------------------------------
// Aulas do Modo Aula. O formato é o mesmo da plataforma (modo aula do
// site), para as aulas trazidas de lá continuarem iguais aqui.
// ------------------------------------------------------------------
export type BView = "traducao" | "strong" | "original" | "interlinear";
/** trecho destacado: [versículo, início, fim, cor] (posições dentro do texto do versículo) */
export type BMark = [number, number, number, number];
export type BMarks = Record<string, BMark[]>;
export type BPassage = { id: string; ref: string; versions: string[]; view: BView; marks?: BMarks };
export type BDeck = { fileId: string; name: string; size: number; pages: number };
export type BFolder = { id: string; name: string; parentId?: string; color?: string };
export type BLesson = {
  id: string;
  title: string;
  folderId?: string;
  passages: BPassage[];
  deck?: BDeck;
  notes?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  /** roteiro (esboço) usado nesta aula */
  roteiroId?: string;
  /** veio da plataforma (e quando) */
  origem?: { site: string; em: string };
};

export type Prefs = {
  porVerso: boolean; // um versículo por vez
  versao: string; // versão padrão dos textos novos
  monitor: number; // monitor do projetor
  escala: number; // tamanho da letra na projeção (0.8 a 1.3)
  tema: "noite" | "papel"; // fundo da projeção
  aparencia: "escuro" | "claro"; // cores do aplicativo
  roteiroFonte: number; // tamanho da letra do roteiro na apresentação (rem)
  vistaAulas: "grade" | "lista";
  vistaRoteiros: "grade" | "lista";
};

export type Store = { lessons: BLesson[]; folders: BFolder[]; prefs: Prefs; versao: 1 };

export const DEFAULT_PREFS: Prefs = { porVerso: true, versao: "NAA", monitor: 1, escala: 1, tema: "noite", aparencia: "escuro", roteiroFonte: 1.35, vistaAulas: "grade", vistaRoteiros: "grade" };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
