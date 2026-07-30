export interface ConfirmationResponse {
  confirmation: {
    token: string;
    operation: 'delete-branch';
    target: string;
    expiresAt: string;
  };
}

export interface DeleteResponse {
  branch: { branch: string };
}
