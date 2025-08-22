// Security-focused validation utilities

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254; // RFC 5321 limit
};

export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Senha deve ter pelo menos 8 caracteres');
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra minúscula');
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra maiúscula');
  }
  
  if (!/(?=.*\d)/.test(password)) {
    errors.push('Senha deve conter pelo menos um número');
  }
  
  if (password.length > 128) {
    errors.push('Senha não pode ter mais de 128 caracteres');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

export const validateName = (name: string): boolean => {
  return name.trim().length >= 2 && name.trim().length <= 100 && /^[a-zA-ZÀ-ÿ\s\-']+$/.test(name.trim());
};

export const validatePhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
  return phoneRegex.test(phone);
};

export const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

// File upload security validation
export const validateFileUpload = (file: File): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];
  
  if (file.size > maxSize) {
    errors.push('Arquivo muito grande. Máximo permitido: 10MB');
  }
  
  if (!allowedTypes.includes(file.type)) {
    errors.push('Tipo de arquivo não permitido');
  }
  
  // Check for malicious file extensions
  const fileName = file.name.toLowerCase();
  const maliciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.jar', '.com', '.pif'];
  const hasMaliciousExtension = maliciousExtensions.some(ext => fileName.endsWith(ext));
  
  if (hasMaliciousExtension) {
    errors.push('Tipo de arquivo não permitido por razões de segurança');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

export const validateAmount = (amount: string): boolean => {
  const numAmount = parseFloat(amount);
  return !isNaN(numAmount) && numAmount >= 0 && numAmount <= 999999.99;
};