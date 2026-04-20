import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to handle contract acceptance check
async function checkLatestContract(supabaseAdmin: any) {
    const { data: contractData, error: contractError } = await supabaseAdmin
        .from('contracts')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (contractError && contractError.code !== 'PGRST116') throw contractError;
    
    return contractData?.id || null;
}

// Helper function to get Proprietário Role ID
async function getProprietarioRoleId(supabaseAdmin: any) {
    const { data: roleData, error: roleError } = await supabaseAdmin
        .from('role_types')
        .select('id')
        .eq('description', 'Proprietário')
        .single();

    if (roleError || !roleData) {
        throw new Error('Proprietário role ID not found. Ensure role_types table is configured.');
    }
    return roleData.id;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    console.log('Edge Function Debug (register-company-and-user): Request received');
    
    const requestBody = await req.json();
    console.log('Edge Function Debug (register-company-and-user): Request body keys:', Object.keys(requestBody));
    console.log('Edge Function Debug (register-company-and-user): Request body values:', {
      hasFirstName: !!requestBody.firstName,
      hasLastName: !!requestBody.lastName,
      hasEmail: !!requestBody.email,
      hasPassword: !!requestBody.password,
      hasPhoneNumber: !!requestBody.phoneNumber,
      hasCompanyName: !!requestBody.companyName,
      hasRazaoSocial: !!requestBody.razaoSocial,
      hasCnpj: !!requestBody.cnpj,
      hasSegmentType: !!requestBody.segmentType,
      hasCompanyEmail: !!requestBody.companyEmail,
      hasCompanyPhoneNumber: !!requestBody.companyPhoneNumber,
    });

    const { 
        // User Data
        firstName, lastName, email, password, phoneNumber, 
        // Placeholder values for missing fields
        cpf = '00000000000', 
        birthDate = '1900-01-01', 
        gender = 'Outro',
        // Company Data
        companyName, razaoSocial, cnpj, ie, companyEmail, companyPhoneNumber, segmentType,
        address, number, neighborhood, complement, zipCode, city, state, imageBase64
    } = requestBody;

    // 1. Input Validation (Basic check, detailed validation is done on frontend)
    const missingFields = [];
    if (!email) missingFields.push('email');
    if (!password) missingFields.push('password');
    if (!companyName) missingFields.push('companyName');
    if (!cnpj) missingFields.push('cnpj');
    if (!segmentType) missingFields.push('segmentType');
    
    if (missingFields.length > 0) {
        console.error('Edge Function Error (register-company-and-user): Missing required fields:', missingFields);
        return new Response(JSON.stringify({ 
            error: 'Missing required data for user or company.',
            missingFields: missingFields
        }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    // 2. Fetch necessary IDs (Contract and Role)
    const latestContractId = await checkLatestContract(supabaseAdmin);
    if (!latestContractId) {
        throw new Error('No active contract found. Cannot register company.');
    }
    const proprietarioRoleId = await getProprietarioRoleId(supabaseAdmin);

    // 3. Create User in Auth (This triggers handle_new_user to create the profile)
    // IMPORTANTE: email_confirm: false para exigir confirmação de email antes de habilitar o sistema
    const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // Requer confirmação de email antes de habilitar o sistema
        user_metadata: {
            first_name: firstName,
            last_name: lastName,
            phone_number: phoneNumber,
            cpf: cpf, // Placeholder
            birth_date: birthDate, // Placeholder
            gender: gender, // Placeholder
        },
    });

    if (signUpError) {
        console.error('Edge Function Error (register-company-and-user): Auth User Creation Error:', signUpError.message);
        console.error('Edge Function Error (register-company-and-user): Auth User Creation Error details:', signUpError);
        return new Response(JSON.stringify({ 
            error: signUpError.message,
            details: signUpError 
        }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }
    const userId = authData.user.id;

    // 4. Upload company logo if provided
    let imageUrl: string | null = null;
    if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.trim() !== '') {
        try {
            // Validate and extract base64 data
            let base64Data: string;
            if (imageBase64.includes(',')) {
                base64Data = imageBase64.split(',')[1]; // Remove data:image/...;base64, prefix
            } else {
                base64Data = imageBase64; // Assume it's already just the base64 data
            }

            if (!base64Data || base64Data.trim() === '') {
                console.warn('Empty base64 data provided, skipping image upload');
            } else {
                // Convert base64 to buffer
                const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                
                // Determine file extension from base64 data URL or default to jpg
                let fileExt = 'jpg';
                const mimeMatch = imageBase64.match(/data:image\/(\w+);base64/);
                if (mimeMatch && mimeMatch[1]) {
                    fileExt = mimeMatch[1].toLowerCase();
                    // Normalize extensions
                    if (fileExt === 'jpeg') fileExt = 'jpg';
                }
                
                const fileName = `${userId}-${Date.now()}.${fileExt}`;
                const filePath = fileName; // Path should be just the filename, not include bucket name

                console.log(`Uploading image: ${fileName} to company_logos bucket`);

                // Upload to Supabase Storage using admin client (bypasses RLS)
                const { error: uploadError } = await supabaseAdmin.storage
                    .from('company_logos')
                    .upload(filePath, imageBuffer, {
                        contentType: `image/${fileExt}`,
                        cacheControl: '3600',
                        upsert: false,
                    });

                if (uploadError) {
                    console.error('Image Upload Error:', uploadError.message, uploadError);
                    // Don't fail the registration if image upload fails, just log it and continue
                    imageUrl = null;
                } else {
                    // Get public URL
                    const { data: publicUrlData } = supabaseAdmin.storage
                        .from('company_logos')
                        .getPublicUrl(filePath);
                    imageUrl = publicUrlData.publicUrl;
                    console.log(`Image uploaded successfully: ${imageUrl}`);
                }
            }
        } catch (error: any) {
            console.error('Error processing image:', error.message, error);
            // Don't fail the registration if image processing fails, just continue without image
            imageUrl = null;
        }
    }

    // 5. Insert Company
    console.log('Edge Function Debug (register-company-and-user): Inserting company data...');
    console.log('Edge Function Debug (register-company-and-user): Company data:', {
        name: companyName,
        razao_social: razaoSocial,
        cnpj: cnpj ? '***' : 'missing',
        segment_type: segmentType,
        user_id: userId,
    });

    const { data: companyData, error: insertCompanyError } = await supabaseAdmin
        .from('companies')
        .insert({
            name: companyName,
            razao_social: razaoSocial,
            cnpj: cnpj,
            ie: ie,
            company_email: companyEmail,
            phone_number: companyPhoneNumber,
            segment_type: segmentType,
            address: address,
            number: number,
            neighborhood: neighborhood,
            complement: complement,
            zip_code: zipCode,
            city: city,
            state: state,
            user_id: userId, // Link company to the creator
            image_url: imageUrl,
            contract_accepted: true,
            accepted_contract_id: latestContractId,
            ativo: true,
        })
        .select('id')
        .single();

    if (insertCompanyError) {
        // If company insertion fails, we should ideally delete the user created in step 3, but for simplicity, we log and throw.
        console.error('Edge Function Error (register-company-and-user): Company Insertion Error:', insertCompanyError.message);
        console.error('Edge Function Error (register-company-and-user): Company Insertion Error details:', insertCompanyError);
        return new Response(JSON.stringify({ 
            error: 'Failed to register company: ' + insertCompanyError.message,
            details: insertCompanyError
        }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }
    const companyId = companyData.id;

    // 6. Assign Proprietário Role and Set as Primary
    const { error: assignRoleError } = await supabaseAdmin.rpc('assign_user_to_company', {
        p_user_id: userId,
        p_company_id: companyId,
        p_role_type_id: proprietarioRoleId
    });

    if (assignRoleError) {
        console.error('Assign Role Error:', assignRoleError.message);
        throw new Error('Failed to assign primary role: ' + assignRoleError.message);
    }

    const { error: setPrimaryError } = await supabaseAdmin.rpc('set_primary_company_role', {
        p_user_id: userId,
        p_company_id: companyId,
        p_role_type_id: proprietarioRoleId
    });

    if (setPrimaryError) {
        console.error('Set Primary Error:', setPrimaryError.message);
        throw new Error('Failed to set company as primary: ' + setPrimaryError.message);
    }

    // 7. Update user type to PROPRIETARIO
    const { error: updateTypeError } = await supabaseAdmin
        .from('type_user')
        .update({ cod: 'PROPRIETARIO', descr: 'Proprietário' })
        .eq('user_id', userId);

    if (updateTypeError) {
        console.warn('Failed to update user type to Proprietario:', updateTypeError.message);
    }

    // 8. Send email confirmation with redirect to login page
    const siteUrl = Deno.env.get('SITE_URL') || 'https://tegyiuktrmcqxkbjxqoc.supabase.co';
    
    console.log('Edge Function Debug (register-company-and-user): Sending email confirmation to:', email);
    console.log('Edge Function Debug (register-company-and-user): Site URL:', siteUrl);
    console.log('Edge Function Debug (register-company-and-user): Redirect to:', `${siteUrl}/login`);

    // Gerar link de confirmação (sempre necessário para o Resend ou fallback do Supabase)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: `${siteUrl}/login`,
      },
    });

    if (linkError) {
      // Tentar recovery se signup falhar, para garantir que um link seja gerado
      const { data: recoveryData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
        options: {
          redirectTo: `${siteUrl}/login`,
        },
      });
      
      if (recoveryData?.properties?.action_link) {
        linkData.properties = { action_link: recoveryData.properties.action_link };
      }
    }

    const confirmationLink = linkData?.properties?.action_link;

    // Declarar emailSentSuccessfully fora do bloco para evitar erro de escopo
    let emailSentSuccessfully = false;

    if (!confirmationLink) {
      console.error('Não foi possível gerar o link de confirmação para o email:', email);
      // Continuar o processo de registro, mas sem o envio de e-mail de confirmação
      console.warn('Registro concluído, mas o e-mail de confirmação não pôde ser gerado. O usuário pode usar o botão de reenviar.');
    } else {
      // Usar a mesma lógica que funciona em resend-email-confirmation
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

      if (!RESEND_API_KEY) {
        console.warn('RESEND_API_KEY não configurada. Email não será enviado no cadastro inicial.');
        console.warn('Configure no Supabase: Edge Functions > register-company-and-user > Settings > Secrets.');
      } else {
        try {
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .button { display: inline-block; padding: 12px 24px; background-color: #F59E0B; color: #000; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>Confirme seu cadastro no TipoAgenda</h2>
                <p>Olá,</p>
                <p>Obrigado por se cadastrar no TipoAgenda! Para ativar sua conta, clique no botão abaixo e faça login:</p>
                <p><a href="${confirmationLink}" class="button">Confirmar E-mail</a></p>
                <p>Ou copie e cole este link no seu navegador:</p>
                <p style="word-break: break-all; color: #0066cc;">${confirmationLink}</p>
                <p>Este link expira em 24 horas.</p>
                <div class="footer">
                  <p>Se você não se cadastrou, ignore este email.</p>
                  <p>© TipoAgenda - Todos os direitos reservados</p>
                </div>
              </div>
            </body>
            </html>
          `;

          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'PlanoAgenda <noreply@planoagenda.com.br>', // Domínio verificado - envia para qualquer email
              to: email,
              subject: 'Confirme seu cadastro no TipoAgenda',
              html: emailHtml,
            }),
          });

          const resendData = await resendResponse.json();

          if (resendResponse.ok) {
            emailSentSuccessfully = true;
            console.log('Edge Function Debug (register-company-and-user): Email confirmation sent successfully via Resend API to:', email);
            
            // 9. Send notification email to admin AFTER successful confirmation email
            const adminEmail = 'edricolpani@hotmail.com';
            
            try {
              // Format phone numbers
              const formatPhone = (phone: string) => {
                if (!phone) return 'N/A';
                const cleaned = phone.replace(/\D/g, '');
                if (cleaned.length === 11) {
                  return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
                } else if (cleaned.length === 10) {
                  return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
                }
                return phone || 'N/A';
              };

              // Format CNPJ
              const formatCnpj = (cnpj: string) => {
                if (!cnpj) return 'N/A';
                const cleaned = cnpj.replace(/\D/g, '');
                if (cleaned.length === 14) {
                  return `${cleaned.substring(0, 2)}.${cleaned.substring(2, 5)}.${cleaned.substring(5, 8)}/${cleaned.substring(8, 12)}-${cleaned.substring(12)}`;
                }
                return cnpj || 'N/A';
              };

              // Format ZIP code
              const formatZipCode = (zip: string) => {
                if (!zip) return '';
                const cleaned = zip.replace(/\D/g, '');
                if (cleaned.length === 8) {
                  return `${cleaned.substring(0, 5)}-${cleaned.substring(5)}`;
                }
                return zip || '';
              };

              const formattedUserPhone = formatPhone(phoneNumber);
              const formattedCompanyPhone = formatPhone(companyPhoneNumber);
              const formattedCnpj = formatCnpj(cnpj);
              const formattedZipCode = formatZipCode(zipCode);
              
              // Build address string
              const addressParts = [
                address || '',
                number ? `Nº ${number}` : '',
                neighborhood || '',
                complement || '',
                city || '',
                state || '',
                formattedZipCode
              ].filter(part => part.trim() !== '');
              const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'N/A';

              const notificationEmailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #F59E0B; color: #000; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                    .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
                    .info-row { margin: 10px 0; padding: 10px; background-color: #fff; border-left: 3px solid #F59E0B; }
                    .label { font-weight: bold; color: #555; }
                    .value { color: #333; margin-top: 5px; }
                    .footer { margin-top: 30px; font-size: 12px; color: #666; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h2>Novo Cadastro de Empresa</h2>
                    </div>
                    <div class="content">
                      <p>Uma nova empresa foi cadastrada no sistema TipoAgenda.</p>
                      
                      <div class="info-row">
                        <div class="label">Nome Fantasia:</div>
                        <div class="value">${companyName || 'N/A'}</div>
                      </div>
                      
                      <div class="info-row">
                        <div class="label">Razão Social:</div>
                        <div class="value">${razaoSocial || 'N/A'}</div>
                      </div>
                      
                      <div class="info-row">
                        <div class="label">CNPJ:</div>
                        <div class="value">${formattedCnpj || 'N/A'}</div>
                      </div>
                      
                      <div class="info-row">
                        <div class="label">Telefone do Usuário:</div>
                        <div class="value">${formattedUserPhone || 'N/A'}</div>
                      </div>
                      
                      <div class="info-row">
                        <div class="label">Telefone da Empresa:</div>
                        <div class="value">${formattedCompanyPhone || 'N/A'}</div>
                      </div>
                      
                      <div class="info-row">
                        <div class="label">Endereço da Empresa:</div>
                        <div class="value">${fullAddress || 'N/A'}</div>
                      </div>
                      
                      <div class="footer">
                        <p>© TipoAgenda - Todos os direitos reservados</p>
                      </div>
                    </div>
                  </div>
                </body>
                </html>
              `;

              console.log('Edge Function Debug (register-company-and-user): Enviando email de notificação via Resend para:', adminEmail);

              const notificationResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${RESEND_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'PlanoAgenda <noreply@planoagenda.com.br>',
                  to: adminEmail,
                  subject: 'Novo cadastro de empresa',
                  html: notificationEmailHtml,
                }),
              });

              const notificationData = await notificationResponse.json();

              console.log('Edge Function Debug (register-company-and-user): Resend response status/ok (notificação):', {
                status: notificationResponse.status,
                ok: notificationResponse.ok,
              });

              if (notificationResponse.ok) {
                console.log('Edge Function Debug (register-company-and-user): Email de notificação enviado com sucesso via Resend API para:', adminEmail);
              } else {
                console.error('Edge Function Error (register-company-and-user): Resend API error (notificação):', notificationData);
                
                if (notificationData.statusCode === 403 && notificationData.message?.includes('testing emails')) {
                  console.warn('Edge Function Warning (register-company-and-user): Resend está em modo de teste. Você só pode enviar emails para o email da sua conta do Resend.');
                }
              }
            } catch (notificationErr: any) {
              console.error('Edge Function Error (register-company-and-user): Error sending notification email:', notificationErr.message);
              // Não falhar o cadastro se o email de notificação falhar
            }
          } else {
            console.error('Edge Function Error (register-company-and-user): Resend API error:', resendData);
            
            // Erro 403 = modo de teste, só permite enviar para email próprio
            if (resendData.statusCode === 403 && resendData.message?.includes('testing emails')) {
              console.warn('Edge Function Warning (register-company-and-user): Resend está em modo de teste. Você só pode enviar emails para o email da sua conta do Resend.');
            }
          }
        } catch (resendErr: any) {
          console.error('Edge Function Error (register-company-and-user): Resend API exception:', resendErr.message);
        }
      }
    }

    if (!emailSentSuccessfully) {
      console.warn('Registration completed, but email confirmation may not have been sent. User can use resend button.');
      console.warn('TIP: Configure RESEND_API_KEY in Edge Function secrets for reliable email delivery.');
    }
    
    // Returning a success message - NO automatic login, user must confirm email first
    return new Response(JSON.stringify({ 
        message: 'User and Company registered successfully. Please check your email to confirm your account.', 
        userId: userId,
        email: email,
        requiresEmailConfirmation: true, // Flag to indicate email confirmation is required
    }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Edge Function Error (register-company-and-user): Uncaught exception:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
