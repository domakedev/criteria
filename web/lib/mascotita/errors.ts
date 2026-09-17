// Error con código HTTP para que las rutas /api/mascotita/* respondan con el
// estado correcto sin filtrar detalles internos.
export class MascotitaError extends Error {
  status: number;
  retryAt: string | null;

  constructor(message: string, status = 400, retryAt: string | null = null) {
    super(message);
    this.name = "MascotitaError";
    this.status = status;
    this.retryAt = retryAt;
  }
}
