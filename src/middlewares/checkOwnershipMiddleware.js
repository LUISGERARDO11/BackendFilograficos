/* This code snippet is defining a middleware function called `checkOwnershipMiddleware` in JavaScript.
This middleware is responsible for verifying that the authenticated user can only access or modify
their own resources. */

// Middleware para verificar que el usuario autenticado solo pueda acceder o modificar sus propios recursos
const checkOwnershipMiddleware = (req, res, next) => {
  const userIdFromToken = req.user.user_id; // ID del usuario autenticado, asignado por authMiddleware
  const userIdFromParams = req.params.id || req.body.user_id; // ID del recurso (puede venir de los parámetros de la URL o del cuerpo de la solicitud)

  // Si no se encuentra el ID en los parámetros o en el cuerpo, retornamos un error
  if (!userIdFromParams) {
    return res
      .status(400)
      .json({ message: "No se proporcionó el ID del recurso." });
  }

  // Comparar los IDs
  if (userIdFromToken !== userIdFromParams) {
    return res
      .status(403)
      .json({ message: "No tienes permiso para acceder a este recurso." });
  }

  // Si todo está bien, pasar al siguiente middleware o controlador
  next();
};

module.exports = checkOwnershipMiddleware;
