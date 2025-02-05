/**
 * The roleMiddleware function in JavaScript is designed to check the user's role against a set of
 * permitted roles and restrict access if the user's role is not included in the permitted roles.
 * @param rolesPermitidos - `rolesPermitidos` es un array que contiene los roles de usuario permitidos
 * para acceder a ciertas rutas o recursos en la aplicación. El middleware `roleMiddleware` se encarga
 * de verificar si el usuario que realiza la solicitud tiene uno de los roles permitidos en ese array.
 * @returns The `roleMiddleware` function is being returned. This function is a middleware that checks
 * if the user's role (retrieved from `req.user.tipo_usuario`) is included in the `rolesPermitidos`
 * array. If the user's role is not included in the array, a 403 status response with a message
 * indicating access is prohibited is sent. If the user's role is valid,
 */

// Middleware para verificar el rol del usuario
const roleMiddleware = (rolesPermitidos) => {
    return (req, res, next) => {
      const { user_type } = req.user; // El middleware de autenticación debe haber agregado `req.user`
  
      if (!rolesPermitidos.includes(user_type)) {
        return res
          .status(403)
          .json({ message: "Acceso prohibido. No tienes el rol adecuado." });
      }
  
      // Si el rol es válido, pasar el control a la siguiente función
      next();
    };
  };
  
  module.exports = roleMiddleware;
  