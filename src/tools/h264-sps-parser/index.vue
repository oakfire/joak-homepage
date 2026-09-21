<script setup lang="ts">
import { ref } from 'vue'
import { parseSPS, parseHex, type SPSResult } from './parser'

const hexInput = ref('')
const result = ref<SPSResult | null>(null)
const error = ref('')

function parse() {
  error.value = ''
  result.value = null
  try {
    const bytes = parseHex(hexInput.value)
    result.value = parseSPS(bytes)
  } catch (e: any) {
    error.value = e.message
  }
}

function clear() {
  hexInput.value = ''
  result.value = null
  error.value = ''
}

function loadExample() {
  hexInput.value = '67 64 00 1E AC D9 40 78 02 27 E5 C0 44 00 00 03 00 04 00 00 03 00 C8 3C 48 96 58'
  parse()
}

interface Field {
  label: string
  value: string | number | boolean | undefined
  note?: string
}

function getFields(r: SPSResult): Field[][] {
  return [
    [
      { label: 'forbidden_zero_bit', value: r.nalu.forbidden },
      { label: 'nal_ref_idc', value: r.nalu.refIdc },
      { label: 'nal_unit_type', value: `${r.nalu.unitType} (${r.nalu.unitTypeName})` },
    ],
    [
      { label: 'profile_idc', value: `${r.profile} (${r.profileName})` },
      { label: 'constraint_set_flags', value: `0x${r.compatibility.toString(16).toUpperCase().padStart(2, '0')}` },
      { label: 'level_idc', value: `${r.level / 10}` },
      { label: 'seq_parameter_set_id', value: r.spsId },
    ],
    ...(r.chromaFormatIdc !== undefined ? [[
      { label: 'chroma_format_idc', value: `${r.chromaFormatIdc} (${r.chromaFormatName})` },
      ...(r.separateColourPlane !== undefined ? [{ label: 'separate_colour_plane_flag', value: r.separateColourPlane } as Field] : []),
      { label: 'bit_depth_luma', value: r.bitDepthLuma },
      { label: 'bit_depth_chroma', value: r.bitDepthChroma },
      { label: 'qpprime_y_zero_transform_bypass', value: r.qpprimeYZeroTransformBypass },
      { label: 'scaling_matrix_present', value: r.scalingMatrixPresent },
    ]] as Field[][] : []),
    [
      { label: 'log2_max_frame_num', value: r.log2MaxFrameNum, note: `max_frame_num = ${1 << r.log2MaxFrameNum}` },
      { label: 'pic_order_cnt_type', value: r.picOrderCntType ?? '-' },
    ],
    ...(r.picOrderCntType === 0 ? [[
      { label: 'log2_max_pic_order_cnt_lsb', value: r.log2MaxPicOrderCntLsb, note: `max = ${1 << r.log2MaxPicOrderCntLsb!}` },
    ]] as Field[][] : []),
    ...(r.picOrderCntType === 1 ? [[
      { label: 'delta_pic_order_always_zero', value: r.deltaPicOrderAlwaysZero },
      { label: 'offset_for_non_ref_pic', value: r.offsetForNonRefPic },
      { label: 'offset_for_top_to_bottom', value: r.offsetForTopToBottom },
      { label: 'ref_frames_in_pic_order_cnt_cycle', value: r.numRefFramesInPicOrderCntCycle },
    ]] as Field[][] : []),
    [
      { label: 'max_num_ref_frames', value: r.maxNumRefFrames },
      { label: 'gaps_in_frame_num_allowed', value: r.gapsInFrameNumAllowed },
    ],
    [
      { label: 'pic_width_in_mbs', value: r.widthMbs, note: `${r.widthMbs} × 16 = ${r.widthMbs * 16}` },
      { label: 'pic_height_in_map_units', value: r.heightMbs, note: `${r.heightMbs} × 16 = ${r.heightMbs * 16}` },
      { label: 'frame_mbs_only_flag', value: r.frameMbsOnly },
      { label: 'direct_8x8_inference_flag', value: r.direct8x8Inference },
    ],
    ...(r.frameCropping ? [[
      { label: 'frame_cropping_flag', value: true },
      { label: 'crop_left', value: r.cropLeft },
      { label: 'crop_right', value: r.cropRight },
      { label: 'crop_top', value: r.cropTop },
      { label: 'crop_bottom', value: r.cropBottom },
    ]] as Field[][] : []),
    [
      { label: 'vui_parameters_present', value: r.vuiPresent },
    ],
  ]
}
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2 mb-4">
      <button class="px-4 py-2 rounded-lg bg-primary text-bg text-sm border-none cursor-pointer hover:opacity-80 transition-opacity" @click="parse">解析</button>
      <button class="px-4 py-2 rounded-lg bg-secondary text-bg text-sm border-none cursor-pointer hover:opacity-80 transition-opacity" @click="loadExample">加载示例</button>
      <button class="px-4 py-2 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="clear">清空</button>
    </div>

    <div class="mb-4">
      <label class="block text-sm text-text-light mb-2">SPS NALU 十六进制数据（可含起始码）</label>
        <textarea
          v-model="hexInput"
          class="w-full h-32 p-4 rounded-lg border border-border bg-bg-card text-text text-sm font-mono resize-y focus:outline-none focus:border-primary transition-colors"
          placeholder="67 64 00 1E AC D9 40 78 02 27 E5 C0 44 00 00 03 00 04 00 00 03 00 C8 3C 48 96 58"
        />
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
      {{ error }}
    </div>

    <div v-if="result">
      <div class="mb-4 p-4 rounded-xl bg-bg-card border border-border">
        <div class="text-sm text-text-light mb-3 font-medium">概览</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div class="text-xs text-text-light">Profile</div>
            <div class="text-lg font-semibold text-text">{{ result.profileName }}</div>
          </div>
          <div>
            <div class="text-xs text-text-light">Level</div>
            <div class="text-lg font-semibold text-text">{{ result.level / 10 }}</div>
          </div>
          <div>
            <div class="text-xs text-text-light">分辨率</div>
            <div class="text-lg font-semibold text-text">{{ result.width }} × {{ result.height }}</div>
          </div>
          <div>
            <div class="text-xs text-text-light">参考帧数</div>
            <div class="text-lg font-semibold text-text">{{ result.maxNumRefFrames }}</div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-border overflow-hidden">
        <div class="bg-bg px-4 py-2 text-sm font-medium text-text-light border-b border-border">详细字段</div>
        <div v-for="(group, gi) in getFields(result)" :key="gi" class="border-b border-border last:border-b-0">
          <div v-for="field in group" :key="field.label" class="flex items-start px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-bg/50 transition-colors">
            <span class="text-sm text-text-light w-64 flex-shrink-0 font-mono">{{ field.label }}</span>
            <span class="text-sm text-text font-mono flex-1">
              {{ typeof field.value === 'boolean' ? (field.value ? '1 (true)' : '0 (false)') : field.value ?? '-' }}
            </span>
            <span v-if="field.note" class="text-xs text-text-light ml-2">{{ field.note }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
