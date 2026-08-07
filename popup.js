let districtData = {};
let subjectData = {};

let appState = {
  activeProfileName: null,
  isDirty: false,
  profiles: {},
  currentPhoto: "",
  currentSig: "",
};

// --- 2. INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
  await loadAllData();
  refreshProfileDropdown();
  setupDynamicDropdowns();
});

async function loadAllData() {
  try {
    const [distRes, gradRes, masRes, sscRes, hscRes] = await Promise.all([
      fetch("data/districts.json"),
      fetch("data/graduation.json"),
      fetch("data/masters.json"),
      fetch("data/ssc.json"),
      fetch("data/hsc.json"),
    ]);

    districtData = await distRes.json();
    const gData = await gradRes.json();
    const mData = await masRes.json();
    const sData = await sscRes.json();
    const hData = await hscRes.json();

    subjectData = { ...gData, ...mData, ...sData, ...hData };
  } catch (err) {
    console.error("❌ Error loading data:", err);
  }
}

// --- 3. DYNAMIC DROPDOWN LOGIC ---
function setupDynamicDropdowns() {
  document
    .querySelector('[name="present_district"]')
    ?.addEventListener("change", function () {
      const districtName = this.options[this.selectedIndex].text;
      const upazilaSelect = document.querySelector('[name="present_upazila"]');
      upazilaSelect.innerHTML =
        '<option value="">-- Select Upazila --</option>';

      if (districtData[districtName]) {
        districtData[districtName].forEach((upazila) => {
          const option = document.createElement("option");
          option.value = upazila.id;
          option.textContent = upazila.name;
          upazilaSelect.appendChild(option);
        });
      }
    });

  const setupExamListener = (examName, subjectName) => {
    const examSelect = document.querySelector(`[name="${examName}"]`);
    const subSelect = document.querySelector(`[name="${subjectName}"]`);

    examSelect?.addEventListener("change", function () {
      const selectedExam = this.options[this.selectedIndex].text;
      subSelect.innerHTML = '<option value="">-- Select Subject --</option>';
      if (subjectData[selectedExam]) {
        subjectData[selectedExam].forEach((sub) => {
          const option = document.createElement("option");
          option.value = sub.id;
          option.textContent = sub.name;
          subSelect.appendChild(option);
        });
      }
    });
  };

  setupExamListener("gra_exam", "gra_subject");
  setupExamListener("mas_exam", "mas_subject");
  setupExamListener("ssc_exam", "ssc_group");
  setupExamListener("hsc_exam", "hsc_group");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

document
  .getElementById("profilePhoto")
  ?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      appState.currentPhoto = await fileToBase64(file);
      const preview = document.getElementById("photoPreview");
      preview.src = appState.currentPhoto;
      preview.style.display = "block";
      appState.isDirty = true;
    }
  });

document
  .getElementById("profileSignature")
  ?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      appState.currentSig = await fileToBase64(file);
      const preview = document.getElementById("sigPreview");
      preview.src = appState.currentSig;
      preview.style.display = "block";
      appState.isDirty = true;
    }
  });

// --- 4. FORM HANDLING ---
function getFormData() {
  const formData = new FormData(document.getElementById("jsonForm"));
  const jsonObject = {};
  formData.forEach((value, key) => {
    jsonObject[key] = value;
  });
  jsonObject.same_as_present = document.querySelector(
    '[name="same_as_present"]',
  )?.checked
    ? "1"
    : "0";

  jsonObject.display_name = jsonObject.name || "";
  jsonObject.confirm_mobile = jsonObject.mobile || "";
  jsonObject.photo_base64 = appState.currentPhoto || "";
  jsonObject.signature_base64 = appState.currentSig || "";
  return jsonObject;
}

// --- 5. TAB SWITCHING ---
document
  .getElementById("tabAutofill")
  .addEventListener("click", () => switchTab("Autofill"));
document
  .getElementById("tabProfile")
  .addEventListener("click", () => switchTab("Profile"));

function switchTab(tab) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelectorAll(".view")
    .forEach((view) => view.classList.remove("active-view"));
  document.getElementById(`tab${tab}`).classList.add("active");
  document.getElementById(`view${tab}`).classList.add("active-view");
}

function refreshProfileDropdown(profileToSelect = null) {
  // Now we ask Chrome for BOTH savedProfiles and the lastActiveProfile
  chrome.storage.local.get(
    ["savedProfiles", "lastActiveProfile"],
    function (result) {
      appState.profiles = result.savedProfiles || {};
      const storedLastActive = result.lastActiveProfile;
      const selector = document.getElementById("profileSelector");

      // 1. Rebuild the dropdown HTML
      selector.innerHTML = '<option value="">Create New Profile</option>';

      let lastProfileName = null;
      for (const profileName in appState.profiles) {
        const opt = document.createElement("option");
        opt.value = profileName;
        opt.textContent = profileName;
        selector.appendChild(opt);
        lastProfileName = profileName;
      }

      // 2. Decide what to select (The Memory Logic)
      let targetSelection = "";

      if (profileToSelect && appState.profiles[profileToSelect]) {
        // Priority 1: The profile you just explicitly asked for (like after saving)
        targetSelection = profileToSelect;
      } else if (
        appState.activeProfileName &&
        appState.profiles[appState.activeProfileName]
      ) {
        // Priority 2: Keep the currently active profile selected while popup is open
        targetSelection = appState.activeProfileName;
      } else if (storedLastActive && appState.profiles[storedLastActive]) {
        // Priority 3: MEMORY - Load the last profile used before you closed the popup
        targetSelection = storedLastActive;
      } else if (lastProfileName) {
        // Priority 4: Fallback - Pick the most recently created profile
        targetSelection = lastProfileName;
      }

      // 3. Apply the selection
      selector.value = targetSelection;
      appState.activeProfileName =
        targetSelection === "" ? null : targetSelection;

      // 4. Save this choice to memory for next time
      if (appState.activeProfileName) {
        chrome.storage.local.set({
          lastActiveProfile: appState.activeProfileName,
        });
      }

      // 5. Sync the visual UI
      updatePreviewCard();
      populateEditorTab();
    },
  );
}

function updatePreviewCard() {
  const previewCard = document.getElementById("previewCard");
  const injectBtn = document.getElementById("injectBtn"); // Get the main button

  if (!appState.activeProfileName) {
    if (previewCard) previewCard.style.display = "none";

    // --- NEW: Change button to "Create" mode ---
    if (injectBtn) {
      injectBtn.textContent = "Create Profile";
      injectBtn.style.backgroundColor = "#2196F3"; // Nice blue color
    }
    return;
  }

  const profile = appState.profiles[appState.activeProfileName];
  if (document.getElementById("displayName"))
    document.getElementById("displayName").textContent = profile.name || "N/A";
  if (document.getElementById("mobileInfo"))
    document.getElementById("mobileInfo").textContent = profile.mobile || "N/A";
  if (document.getElementById("emailInfo"))
    document.getElementById("emailInfo").textContent = profile.email || "N/A";
  if (previewCard) previewCard.style.display = "block";

  // --- NEW: Restore button to "Auto-Fill" mode ---
  if (injectBtn) {
    injectBtn.textContent = "Auto-Fill";
    injectBtn.style.backgroundColor = "#4CAF50"; // Standard green color
  }
}

document
  .getElementById("profileSelector")
  .addEventListener("change", function () {
    const selectedName = this.value;
    if (
      appState.isDirty &&
      !confirm("You have unsaved changes in the editor. Discard them?")
    ) {
      this.value = appState.activeProfileName || "";
      return;
    }

    appState.activeProfileName = selectedName === "" ? null : selectedName;
    appState.isDirty = false;

    // --- NEW MEMORY LOGIC ---
    if (appState.activeProfileName) {
      chrome.storage.local.set({
        lastActiveProfile: appState.activeProfileName,
      });
    } else {
      chrome.storage.local.remove("lastActiveProfile"); // Cleared if they pick "Create New"
    }

    updatePreviewCard();
    populateEditorTab();
  });

function populateEditorTab() {
  const form = document.getElementById("jsonForm");
  const header = document.getElementById("editorHeader");
  const saveBtn = document.getElementById("saveBtn");
  const profileNameInput = document.getElementById("profileName");

  // ⚡ MOVED HERE: Define it once at the top!
  const deleteBtn = document.getElementById("deleteProfileBtn");

  const pPreview = document.getElementById("photoPreview");
  const sPreview = document.getElementById("sigPreview");
  const photoInput = document.getElementById("profilePhoto");
  const sigInput = document.getElementById("profileSignature");

  if (!appState.activeProfileName) {
    // 1. BLANK PROFILE MODE
    form.reset();
    profileNameInput.value = "";
    if (header) header.textContent = "✨ Creating New Profile";
    if (saveBtn) saveBtn.textContent = "💾 Save New Profile";

    // ⚡ Cleaner: Just hide it
    if (deleteBtn) deleteBtn.style.display = "none";

    // Clear the images from memory and hide the previews
    appState.currentPhoto = "";
    appState.currentSig = "";

    if (pPreview) {
      pPreview.src = "";
      pPreview.style.display = "none";
    }
    if (sPreview) {
      sPreview.src = "";
      sPreview.style.display = "none";
    }
    if (photoInput) photoInput.value = "";
    if (sigInput) sigInput.value = "";
  } else {
    // 2. EDIT EXISTING PROFILE MODE

    // ⚡ Cleaner: Just show it
    if (deleteBtn) deleteBtn.style.display = "block";

    const data = appState.profiles[appState.activeProfileName];
    profileNameInput.value = appState.activeProfileName;
    if (header)
      header.textContent = `✏️ Editing: ${appState.activeProfileName}`;
    if (saveBtn) saveBtn.textContent = "💾 Update Profile";

    // Load existing images into memory and show previews
    appState.currentPhoto = data ? data.photo_base64 || "" : "";
    appState.currentSig = data ? data.signature_base64 || "" : "";

    if (pPreview) {
      pPreview.src = appState.currentPhoto;
      pPreview.style.display = appState.currentPhoto ? "block" : "none";
    }
    if (sPreview) {
      sPreview.src = appState.currentSig;
      sPreview.style.display = appState.currentSig ? "block" : "none";
    }

    if (photoInput) photoInput.value = "";
    if (sigInput) sigInput.value = "";

    // Fill all the text fields
    for (const key in data) {
      const field = form.querySelector(`[name="${key}"]`);
      if (field) {
        if (field.type === "checkbox") field.checked = data[key] === "1";
        else field.value = data[key];
        field.dispatchEvent(new Event("change"));
      }
    }

    // Wait a tiny bit for the dynamic dropdowns
    setTimeout(() => {
      const dynamicFields = [
        "present_upazila",
        "gra_subject",
        "mas_subject",
        "ssc_group",
        "hsc_group",
        "ssc_board",
        "hsc_board",
      ];
      dynamicFields.forEach((f) => {
        const field = form.querySelector(`[name="${f}"]`);
        if (field && data[f]) field.value = data[f];
      });
    }, 150);
  }
}

document.getElementById("jsonForm").addEventListener("input", () => {
  if (!appState.isDirty) {
    appState.isDirty = true;
    const header = document.getElementById("editorHeader");
    if (header && !header.textContent.includes("*(Unsaved)*")) {
      header.textContent += " *(Unsaved)*";
    }
  }
});

// --- 6. ACTION BUTTON LISTENERS ---
const editShortcutBtn = document.getElementById("editShortcutBtn");
if (editShortcutBtn) {
  editShortcutBtn.addEventListener("click", () => {
    if (!appState.activeProfileName)
      return alert("Select a profile to edit first.");
    switchTab("Profile");
  });
}

const startBlankBtn = document.getElementById("startBlankBtn");
if (startBlankBtn) {
  startBlankBtn.addEventListener("click", () => {
    if (appState.isDirty && !confirm("Discard unsaved changes?")) return;
    document.getElementById("profileSelector").value = "";
    appState.activeProfileName = null;
    appState.isDirty = false;
    updatePreviewCard();
    populateEditorTab();
  });
}

const saveBtn = document.getElementById("saveBtn");
if (saveBtn) {
  saveBtn.addEventListener("click", function () {
    const newProfileName = document.getElementById("profileName").value.trim();
    if (!newProfileName)
      return alert("Please enter a name to save this profile as!");

    const finalData = getFormData();
    appState.profiles[newProfileName] = finalData;
    appState.activeProfileName = newProfileName;
    appState.isDirty = false;

    chrome.storage.local.set({ savedProfiles: appState.profiles }, () => {
      saveBtn.textContent = "✅ Saved!";
      setTimeout(() => populateEditorTab(), 2000);
      refreshProfileDropdown();
      document.getElementById("profileSelector").value = newProfileName;
      updatePreviewCard();
    });
  });
}

const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", function () {
    const finalData = getFormData();
    const jsonString = JSON.stringify(finalData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename:
        (document.getElementById("profileName").value || "profile") + ".json",
      saveAs: true,
    });
  });
}

const importFile = document.getElementById("importFile");
if (importFile) {
  importFile.addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        document.getElementById("profileName").value = file.name.replace(
          ".json",
          "",
        );

        appState.activeProfileName = null;
        appState.isDirty = true;
        const header = document.getElementById("editorHeader");
        if (header) header.textContent = "📂 Imported Profile *(Unsaved)*";

        // ⚡ FIX: Manually load the images into memory and UI
        appState.currentPhoto = data.photo_base64 || "";
        appState.currentSig = data.signature_base64 || "";

        const pPreview = document.getElementById("photoPreview");
        const sPreview = document.getElementById("sigPreview");
        if (pPreview) {
          pPreview.src = appState.currentPhoto;
          pPreview.style.display = appState.currentPhoto ? "block" : "none";
        }
        if (sPreview) {
          sPreview.src = appState.currentSig;
          sPreview.style.display = appState.currentSig ? "block" : "none";
        }

        // Fill standard text boxes and dropdowns
        const form = document.getElementById("jsonForm");
        for (const key in data) {
          const field = form.querySelector(`[name="${key}"]`);
          if (field) {
            if (field.type === "checkbox") {
              field.checked = data[key] === "1";
            } else {
              field.value = data[key];
            }
            field.dispatchEvent(new Event("change"));
          }
        }

        // Fill dynamic dropdowns safely
        setTimeout(() => {
          const dynamicFields = [
            "present_upazila",
            "gra_subject",
            "mas_subject",
            "ssc_group",
            "hsc_group",
            "ssc_board",
            "hsc_board",
          ];
          dynamicFields.forEach((f) => {
            const field = form.querySelector(`[name="${f}"]`);
            if (field && data[f]) field.value = data[f];
          });
        }, 150);

        // Reset the file input so you can import the same file again if needed
        event.target.value = "";
      } catch (error) {
        alert("Error reading JSON file. Make sure it is a valid profile.");
      }
    };
    reader.readAsText(file);
  });
}

// CAPTCHA Only Button Listener
document
  .getElementById("solveCaptchaOnlyBtn")
  ?.addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: "AUTO_SOLVE_CAPTCHA" });
      window.close();
    }
  });

// --- 7. AUTO-FILL + CAPTCHA SOLVER INJECTION ---
document.getElementById("injectBtn").addEventListener("click", async () => {
  const selectedProfile = document.getElementById("profileSelector").value;

  // --- NEW: If in "Create" mode, switch to Tab 2 and stop ---
  if (!selectedProfile) {
    switchTab("Profile");
    return;
  }

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.storage.local.get(["savedProfiles"], async (result) => {
    const profiles = result.savedProfiles || {};
    const dataToInject = profiles[selectedProfile];

    if (!dataToInject) return alert("Error: Profile data could not be found!");

    chrome.storage.local.set({ page2Armed: selectedProfile });

    const masterDict = {};

    document.querySelectorAll("select").forEach((select) => {
      masterDict[select.name] = {};
      for (let opt of select.options) {
        if (opt.value) masterDict[select.name][opt.value] = opt.text.trim();
      }
    });

    if (!masterDict["present_upazila"]) masterDict["present_upazila"] = {};
    for (const dist in districtData) {
      districtData[dist].forEach((upz) => {
        masterDict["present_upazila"][upz.id] = upz.name.trim();
      });
    }

    const subFields = ["ssc_group", "hsc_group", "gra_subject", "mas_subject"];
    subFields.forEach((field) => {
      if (!masterDict[field]) masterDict[field] = {};
      for (const exam in subjectData) {
        subjectData[exam].forEach((sub) => {
          masterDict[field][sub.id] = sub.name.trim();
        });
      }
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (profile, dict) => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        function fill(name, value) {
          if (value === undefined || value === "") return;

          const el =
            document.getElementsByName(name)[0] ||
            document.getElementById(name);
          if (!el) return;

          el.value = value;

          if (el.tagName === "SELECT") {
            const expectedText =
              dict[name] && dict[name][value]
                ? dict[name][value].toLowerCase().trim()
                : null;

            let isCorrect = false;
            if (el.selectedIndex >= 0) {
              const currentText = el.options[el.selectedIndex].text
                .toLowerCase()
                .trim();
              const currentVal = el.options[el.selectedIndex].value;

              if (expectedText && currentText === expectedText) {
                isCorrect = true;
              } else if (!expectedText && currentVal === String(value)) {
                isCorrect = true;
              }
            }

            if (!isCorrect) {
              const targetValStr = String(value).toLowerCase().trim();

              for (let i = 0; i < el.options.length; i++) {
                const optVal = el.options[i].value;
                const optText = el.options[i].text.toLowerCase().trim();

                if (expectedText && optText === expectedText) {
                  el.selectedIndex = i;
                  break;
                }

                if (
                  !isNaN(optVal) &&
                  !isNaN(value) &&
                  optVal.trim() !== "" &&
                  String(value).trim() !== ""
                ) {
                  if (Number(optVal) === Number(value)) {
                    el.selectedIndex = i;
                    break;
                  }
                }

                if (
                  optVal.toLowerCase().trim() === targetValStr ||
                  optText === targetValStr
                ) {
                  el.selectedIndex = i;
                  break;
                }
              }
            }
          }

          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }

        function check(name) {
          const el =
            document.getElementsByName(name)[0] ||
            document.getElementById(name);
          if (el && !el.checked) {
            el.click();
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }

        console.log("🚀 Starting Auto-Fill...");

        fill("name", profile.name);
        fill("name_bn", profile.name_bn);
        fill("father", profile.father);
        fill("father_bn", profile.father_bn);
        fill("mother", profile.mother);
        fill("mother_bn", profile.mother_bn);
        fill("dob", profile.dob);
        fill("nationality", profile.nationality);
        fill("religion", profile.religion);
        fill("gender", profile.gender);

        const hasNid = profile.nid_no && String(profile.nid_no).trim() !== "";
        fill("nid", hasNid ? profile.nid : "No");
        if (hasNid) fill("nid_no", profile.nid_no);

        const hasBreg =
          profile.breg_no && String(profile.breg_no).trim() !== "";
        fill("breg", hasBreg ? profile.breg : "No");
        if (hasBreg) fill("breg_no", profile.breg_no);

        const hasPassport =
          profile.passport_no && String(profile.passport_no).trim() !== "";
        fill("passport", hasPassport ? profile.passport : "No");
        if (hasPassport) fill("passport_no", profile.passport_no);

        fill("marital_status", profile.marital_status);
        fill("mobile", profile.mobile);
        fill("confirm_mobile", profile.mobile);
        fill("email", profile.email);
        fill("quota", profile.quota);
        fill("dep_status", profile.dep_status);

        fill("present_careof", profile.present_careof);
        fill("present_village", profile.present_village);
        fill("present_post", profile.present_post);
        fill("present_postcode", profile.present_postcode);
        fill("present_district", profile.present_district);

        fill("ssc_roll", profile.ssc_roll);
        fill("ssc_result_type", profile.ssc_result_type);
        fill("ssc_result", profile.ssc_result);
        fill("ssc_year", profile.ssc_year);
        fill("ssc_exam", profile.ssc_exam);

        if (profile.hsc_exam) {
          check("if_applicable_hsc");
          fill("hsc_roll", profile.hsc_roll);
          fill("hsc_result_type", profile.hsc_result_type);
          fill("hsc_result", profile.hsc_result);
          fill("hsc_year", profile.hsc_year);
          fill("hsc_exam", profile.hsc_exam);
        }

        if (profile.gra_exam) {
          check("if_applicable_gra");
          fill("gra_result_type", profile.gra_result_type);
          fill("gra_result", profile.gra_result);
          fill("gra_duration", profile.gra_duration);
          fill("gra_year", profile.gra_year);
          fill("gra_exam", profile.gra_exam);
        }

        if (profile.mas_exam) {
          check("if_applicable_mas");
          fill("mas_result_type", profile.mas_result_type);
          fill("mas_result", profile.mas_result);
          fill("mas_duration", profile.mas_duration);
          fill("mas_year", profile.mas_year);
          fill("mas_exam", profile.mas_exam);
        }

        await sleep(1500);

        fill("present_upazila", profile.present_upazila);
        fill("ssc_board", profile.ssc_board);
        fill("ssc_group", profile.ssc_group);

        if (profile.hsc_exam) {
          fill("hsc_board", profile.hsc_board);
          fill("hsc_group", profile.hsc_group);
        }
        if (profile.gra_exam) {
          fill("gra_institute", profile.gra_institute);
          fill("gra_subject", profile.gra_subject);
        }
        if (profile.mas_exam) {
          fill("mas_institute", profile.mas_institute);
          fill("mas_subject", profile.mas_subject);
        }

        await sleep(500);

        const allSelects = document.querySelectorAll("select");
        const protectedFields = [
          "nid",
          "breg",
          "passport",
          "gender",
          "religion",
          "quota",
          "dep_status",
          "marital_status",
        ];

        allSelects.forEach((select) => {
          if (protectedFields.includes(select.name)) return;
          for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].text.trim().toLowerCase() === "yes") {
              select.selectedIndex = i;
              select.dispatchEvent(new Event("input", { bubbles: true }));
              select.dispatchEvent(new Event("change", { bubbles: true }));
              break;
            }
          }
        });

        check("same_as_present");
        check("agree");

        const captchaInput = document.getElementById("captcha");
        if (captchaInput) {
          captchaInput.style.border = "3px solid #ff9800";
          captchaInput.style.backgroundColor = "#fff3e0";
          captchaInput.style.boxShadow = "0 0 10px rgba(255, 152, 0, 0.8)";
          captchaInput.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            captchaInput.focus();
          }, 300);
        }

        function injectVirtualFile(base64Data, filename, keywords) {
          if (!base64Data || base64Data.trim() === "") return;

          const fileInputs = document.querySelectorAll('input[type="file"]');
          let target = null;

          for (const el of fileInputs) {
            const identifier = (
              (el.name || "") +
              " " +
              (el.id || "") +
              " " +
              (el.className || "")
            ).toLowerCase();
            if (keywords.some((kw) => identifier.includes(kw))) {
              target = el;
              break;
            }
          }

          if (target) {
            try {
              const arr = base64Data.split(",");
              const mime = arr[0].match(/:(.*?);/)[1];
              const bstr = atob(arr[1]);
              let n = bstr.length;
              const u8arr = new Uint8Array(n);
              while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
              }
              const file = new File([u8arr], filename, { type: mime });

              const dt = new DataTransfer();
              dt.items.add(file);
              target.files = dt.files;

              target.dispatchEvent(new Event("input", { bubbles: true }));
              target.dispatchEvent(new Event("change", { bubbles: true }));

              target.style.border = "3px solid #4CAF50";
            } catch (err) {
              console.error(`❌ Error uploading ${filename}:`, err);
            }
          }
        }

        injectVirtualFile(profile.photo_base64, "photo.jpg", [
          "photo",
          "pic",
          "image",
        ]);
        injectVirtualFile(profile.signature_base64, "signature.jpg", [
          "sig",
          "sign",
        ]);

        console.log("✅ Auto-Fill Complete!");
      },
      args: [dataToInject, masterDict],
    });

    // ⚡ AUTOMATICALLY TRIGGER CAPTCHA SOLVER ON ACTIVE TAB RIGHT AFTER AUTO-FILL
    chrome.tabs.sendMessage(tab.id, { type: "AUTO_SOLVE_CAPTCHA" });

    window.close();
  });
});

// ==========================================
// 🤖 TELETALK PDF SCANNER (ADVANCED PARSER)
// ==========================================
document.addEventListener("click", (e) => {
  // 1. OPEN MODAL
  if (e.target.id === "openScanModalBtn") {
    e.preventDefault();
    document.getElementById("cvModalOverlay").style.display = "flex";
    document.getElementById("cvPasteBox").value = "";
    document.getElementById("cvPasteBox").focus();
  }

  // 2. CLOSE MODAL (Cancel)
  if (e.target.id === "closeCvModalBtn") {
    e.preventDefault();
    document.getElementById("cvModalOverlay").style.display = "none";
  }

  // 3. EXECUTE SCAN & FILL
  if (e.target.id === "executeScanBtn") {
    e.preventDefault();
    const cvText = document.getElementById("cvPasteBox").value;
    if (!cvText.trim()) return alert("Please paste the PDF text into the box!");

    if (appState.isDirty && !confirm("Discard your current unsaved changes?")) {
      document.getElementById("cvModalOverlay").style.display = "none";
      return;
    }

    console.log("🔍 Running Advanced Teletalk Extraction...");

    // --- PREPARE BLANK PROFILE ---
    const profileSelector = document.getElementById("profileSelector");
    if (profileSelector) profileSelector.value = "";
    appState.activeProfileName = null;
    appState.isDirty = true;
    document.getElementById("jsonForm").reset();

    // Ensure image previews are wiped for the blank profile
    appState.currentPhoto = "";
    appState.currentSig = "";
    const pPreview = document.getElementById("photoPreview");
    const sPreview = document.getElementById("sigPreview");
    if (pPreview) {
      pPreview.src = "";
      pPreview.style.display = "none";
    }
    if (sPreview) {
      sPreview.src = "";
      sPreview.style.display = "none";
    }

    updatePreviewCard();
    populateEditorTab();

    // Helper: Set Field safely
    const setField = (fieldName, value) => {
      if (!value) return;
      const el = document.querySelector(`[name="${fieldName}"]`);
      if (!el) return;

      if (el.tagName === "SELECT") {
        for (let i = 0; i < el.options.length; i++) {
          if (
            el.options[i].text.toLowerCase().includes(value.toLowerCase()) ||
            String(el.options[i].value).toLowerCase() === value.toLowerCase()
          ) {
            el.selectedIndex = i;
            break;
          }
        }
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    // ==============================================
    // 🧩 THE ULTIMATE TELETALK PARSER (VALUE-BASED)
    // ==============================================

    // --- 1. GLOBAL UNIQUE VALUES (Email, Phone, NID, Dropdowns) ---
    // Email (Hunts for the @ format)
    const emailMatch = cvText.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    );
    if (emailMatch) setField("email", emailMatch[0]);

    // Mobile (Hunts for 11 digits starting with 01)
    const phoneMatch = cvText.match(/\b(01[3-9]\d{8})\b/);
    if (phoneMatch) setField("mobile", phoneMatch[1]);

    // NID (Tries label first, then hunts for a standalone 10, 13, or 17 digit number)
    const nidRegexMatch = cvText.match(/National ID[ \t]*[:H\-]?[ \t]*(\d+)/i);
    if (nidRegexMatch) {
      setField("nid_no", nidRegexMatch[1]);
    } else {
      const looseNid = cvText.match(/\b(\d{10}|\d{13}|\d{17})\b/);
      if (looseNid) setField("nid_no", looseNid[1]);
    }

    // Dropdowns (Hunts the entire document for these exact words)
    const genderMatch = cvText.match(/\b(Male|Female)\b/i);
    if (genderMatch) setField("gender", genderMatch[0]);

    const relMatch = cvText.match(
      /\b(Islam|Hinduism|Buddhism|Christianity)\b/i,
    );
    if (relMatch) setField("religion", relMatch[0]);

    const maritalMatch = cvText.match(/\b(Single|Married|Widowed)\b/i);
    if (maritalMatch) setField("marital_status", maritalMatch[0]);

    // Date of Birth
    const dobMatch = cvText.match(
      /(\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})/i,
    );
    if (dobMatch) {
      const months = {
        Jan: "01",
        Feb: "02",
        Mar: "03",
        Apr: "04",
        May: "05",
        Jun: "06",
        Jul: "07",
        Aug: "08",
        Sep: "09",
        Oct: "10",
        Nov: "11",
        Dec: "12",
      };
      setField("dob", `${dobMatch[3]}-${months[dobMatch[2]]}-${dobMatch[1]}`);
    }

    // --- 2. NAMES (The "Filter & Stack" Anchor Method) ---
    // Because columns get split, we destroy all labels so the raw names stack perfectly on top of the DOB.
    let cleanedLines = [];
    const labelsToStrip = [
      /Applicant's Name/gi,
      /আবেদনকারীর নাম/g,
      /Father's Name/gi,
      /পিতার নাম/g,
      /Mother's Name/gi,
      /মাতার নাম/g,
      /Date of Birth/gi,
      /Name of the Post/gi,
      /Basic Information/gi,
      /User Id/gi,
      /User IР/gi,
      /Nationality/gi,
      /Religion/gi,
      /Gender/gi,
      /National ID/gi,
      /Birth Registration/gi,
      /Passport ID/gi,
      /Marital Status/gi,
      /Mobile Number/gi,
      /Email/gi,
      /Quota/gi,
      /Departmental Status/gi,
      /Ref\. No\./gi,
    ];

    for (let line of cvText.split("\n")) {
      // 1. Strip out every known label from the line
      for (let regex of labelsToStrip) {
        line = line.replace(regex, "");
      }
      // 2. Remove leading/trailing colons, hyphens, and whitespace
      line = line.replace(/^[:\-\s]+|[:\-\s]+$/g, "").trim();

      // 3. Ignore garbage leftover characters
      if (
        line === "" ||
        line === "H" ||
        line === "B" ||
        line === ":" ||
        line === "N/A" ||
        line.includes("Dated:")
      ) {
        continue;
      }
      cleanedLines.push(line); // Save the clean value!
    }

    // Find the exact line containing the DOB in our clean list
    const dobIndex = cleanedLines.findIndex((l) =>
      l.match(
        /^\d{2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}/i,
      ),
    );

    // The 6 lines immediately above the DOB will ALWAYS be the names, no matter how the PDF split!
    if (dobIndex >= 6) {
      setField("name", cleanedLines[dobIndex - 6]);
      setField("name_bn", cleanedLines[dobIndex - 5]);
      setField("father", cleanedLines[dobIndex - 4]);
      setField("father_bn", cleanedLines[dobIndex - 3]);
      setField("mother", cleanedLines[dobIndex - 2]);
      setField("mother_bn", cleanedLines[dobIndex - 1]);
    }

    // --- 4. ADDRESS EXTRACTION (The First-Match Rule) ---
    // Because "Present Address" is always listed first, grabbing the FIRST match gets Present.

    const careofMatch = cvText.match(
      /Care Of[ \t]*[:H\-]?[ \t]*([^\n]+?)(?:\s+Care Of|$)/i,
    );
    if (careofMatch) setField("present_careof", careofMatch[1].trim());

    // Handles Vill/ Road/ AND Vill/Town/Road/ AND weird boxes
    const villMatch = cvText.match(
      /Vill\/.*?Road\/[ \t]*[:H\-☐]?[ \t]*([^\n]+?)(?:\s+Vill|$)/i,
    );
    if (villMatch) setField("present_village", villMatch[1].trim());

    const districtMatch = cvText.match(
      /District[ \t]*[:H\-]?[ \t]*([A-Za-z\s]+?)(?:\s+District|$)/i,
    );
    if (districtMatch) setField("present_district", districtMatch[1].trim());

    const upazilaMatch = cvText.match(
      /Upazila\/P\.S\.[ \t]*[:H\-]?[ \t]*([A-Za-z\s]+?)(?:\s+Upazila|$)/i,
    );
    if (upazilaMatch) setField("present_upazila", upazilaMatch[1].trim());

    const postMatch = cvText.match(
      /Post Office[ \t]*[:H\-]?[ \t]*([A-Za-z\s\-]+?)(?:\s+Post Office|$)/i,
    );
    if (postMatch) setField("present_post", postMatch[1].trim());

    const codeMatch = cvText.match(/Post Code[ \t]*[:H\-]?[ \t]*(\d{4})/i);
    if (codeMatch) setField("present_postcode", codeMatch[1].trim());

    // --- 5. EDUCATION GRID (Newline-Proof & Scramble-Proof) ---
    // 1. Flatten the entire text to destroy any line-breaks inside long University/Subject names!
    let eduText = cvText.replace(/\n/g, " ").replace(/\s+/g, " ");

    // 2. The Smart Extractor Engine
    const extractEdu = (examKeywords) => {
      // Pattern A: Standard Layout (Handles long line-broken names perfectly)
      const regNormal = new RegExp(
        `(${examKeywords})\\s+(.+?)\\s+(\\d+|N\\/A)\\s+(?:GPA|CGPA)\\s+([0-9.]+)\\s*(?:\\(Out of.*?\\d\\))?\\s+(.+?)\\s+(\\d{4})`,
        "i",
      );
      let m = eduText.match(regNormal);
      if (m)
        return {
          exam: m[1],
          inst: m[2],
          roll: m[3],
          result: m[4],
          sub: m[5],
          year: m[6],
        };

      // Pattern B: Severe PDF Scramble (Handles when GPA wraps BEFORE the Exam Name!)
      const regScramble = new RegExp(
        `(?:GPA|CGPA)\\s+([0-9.]+).*?(${examKeywords})\\s+(.+?)\\s+(\\d+|N\\/A)\\s+(.+?)\\s+(\\d{4})`,
        "i",
      );
      m = eduText.match(regScramble);
      if (m)
        return {
          exam: m[2],
          inst: m[3],
          roll: m[4],
          result: m[1],
          sub: m[5],
          year: m[6],
        };

      return null;
    };

    // 3. Execute and Fill Fields
    const ssc = extractEdu("S\\.S\\.C|Dakhil|O-Level");
    if (ssc) {
      setField("ssc_exam", ssc.exam.trim());
      setField("ssc_board", ssc.inst.trim());
      setField("ssc_roll", ssc.roll.trim());
      setField("ssc_result", ssc.result.trim());
      setField("ssc_group", ssc.sub.trim());
      setField("ssc_year", ssc.year.trim());
    }

    const hsc = extractEdu("H\\.S\\.C|Alim|A-Level");
    if (hsc) {
      setField("hsc_exam", hsc.exam.trim());
      setField("hsc_board", hsc.inst.trim());
      setField("hsc_roll", hsc.roll.trim());
      setField("hsc_result", hsc.result.trim());
      setField("hsc_group", hsc.sub.trim());
      setField("hsc_year", hsc.year.trim());
    }

    const gra = extractEdu("Honors|B\\.Sc|B\\.A|BSS|BBA|Degree");
    if (gra) {
      setField("gra_exam", gra.exam.trim());
      setField("gra_institute", gra.inst.trim());
      setField("gra_result", gra.result.trim());
      setField("gra_subject", gra.sub.trim());
      setField("gra_year", gra.year.trim());
    }

    const mas = extractEdu("M\\.A|M\\.Sc|MSS|MBA|M\\.Com|Masters");
    if (mas) {
      setField("mas_exam", mas.exam.trim());
      setField("mas_institute", mas.inst.trim());
      setField("mas_result", mas.result.trim());
      setField("mas_subject", mas.sub.trim());
      setField("mas_year", mas.year.trim());
    }

    // --- FINISH UP ---
    document.getElementById("cvModalOverlay").style.display = "none";

    const header = document.getElementById("editorHeader");
    if (header) header.textContent = "✨ Scanned Profile *(Unsaved)*";

    setTimeout(() => {
      alert(
        "✅ Teletalk PDF Extracted! \n\nCheck the fields. It successfully found your English/Bengali names, Parents, Phone, Email, NID, DOB, and Education Rolls/Years!",
      );
    }, 300);
  }
});
