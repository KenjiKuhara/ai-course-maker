const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function seed() {
  console.log("Starting seed script...");
  
  // 1. Read .env.local
  const envPath = path.resolve(__dirname, '../.env.local');
  let envContent = '';
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (e) {
    console.error('Could not read .env.local');
    process.exit(1);
  }

  const env = {};
  envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) env[key.trim()] = val.trim();
  });

  const url = env['NEXT_PUBLIC_SUPABASE_URL'];
  let key = env['SUPABASE_SERVICE_ROLE_KEY'];
  const anonKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  
  const isServiceKey = !!key;

  if (!url) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
      process.exit(1);
  }

  if (!key) {
      console.log('SUPABASE_SERVICE_ROLE_KEY not found. Trying with Anon Key...');
      key = anonKey;
      if (!key) {
          console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
          process.exit(1);
      }
  }

  const supabase = createClient(url, key);

  const email = 'teacher@example.com';
  const password = 'password123';
  const name = 'Test Teacher';

  console.log(`Target User: ${email}`);
  console.log(`Using Key: ${isServiceKey ? 'Service Role (Admin)' : 'Anon (Public)'}`);

  let userId;

  if (isServiceKey) {
      // Admin creation
      const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name }
      });
      if (error) {
           console.log('Admin create error (may exist):', error.message);
           // Try to find user
           const { data: { users } } = await supabase.auth.admin.listUsers();
           const user = users.find(u => u.email === email);
           if (user) userId = user.id;
      }
      else {
          userId = data.user.id;
      }
  } else {
      // Public SignUp
      const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
              data: { name }
          }
      });
      
      if (error) {
          console.log('SignUp error:', error.message);
      } else {
          console.log('SignUp call successful.');
          if (data.user) {
              userId = data.user.id;
              console.log('User ID obtained:', userId);
          }
      }
  }

  // Fallback: Try SignIn if we still don't have ID (maybe already signed up)
  if (!userId) {
       console.log("Attempting SignIn to retrieve ID...");
       const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
      });
      if (data.user) {
          console.log('SignIn successful.');
          userId = data.user.id;
      } else {
          console.log('SignIn failed:', error ? error.message : 'Unknown error');
      }
  }

  if (!userId) {
      console.error("Could not obtain User ID. Exiting.");
      return;
  }

  console.log(`Proceeding with User ID: ${userId}`);

  // 3. Insert into teachers table
  const { data: teacher, error: fetchError } = await supabase
    .from('teachers')
    .select('*')
    .eq('teacher_id', userId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "Row not found"
      console.error("Error fetching teacher:", fetchError.message);
  }

  if (!teacher) {
    console.log('Inserting into teachers table...');
    const { error: insertError } = await supabase.from('teachers').insert({
      teacher_id: userId,
      name: name,
      email: email
    });
    
    if (insertError) console.error('Error inserting teacher:', insertError.message);
    else console.log('Teacher record created successfully.');
  } else {
    console.log('Teacher record already exists.');
  }
}

seed();
